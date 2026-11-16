const DEFAULT_ALLOWED_HOSTS = [
  'dirkjan.nl',
  'www.dirkjan.nl'
];

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'link',
  'content-security-policy',
  'content-security-policy-report-only'
]);

const HTML_CACHE_TTL = 600;
const MISSING_COMIC_CACHE_TTL = 60;
const UPSTREAM_COOLDOWN_SECONDS = 60;
const ARCHIVE_AGE_MS = 7 * 86400 * 1000;
const IMAGE_CACHE_TTL = 86400;
const DEFAULT_CACHE_TTL = 3600;
const UPSTREAM_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;
const MAX_CACHEABLE_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_TELEMETRY_BYTES = 1024;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 120;
const rateLimitBuckets = new Map();
const TELEMETRY_EVENTS = new Set([
  'comic_parse_failed',
  'proxy_exhausted',
  'service_worker_failed',
  'storage_failed'
]);

export default {
  async fetch(request, env, ctx) {
    const allowedHosts = getAllowedHosts(env);
    const allowedOrigins = getAllowedOrigins(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(request, allowedOrigins)
      });
    }

    if (isRateLimited(request, env)) {
      const limited = jsonResponse({ error: 'Too many requests' }, 429);
      limited.headers.set('retry-after', '60');
      return withCors(request, limited, false, allowedOrigins);
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === '/-/telemetry') {
      return handleTelemetry(request, allowedOrigins);
    }
    if (requestUrl.pathname === '/-/comic-metadata') {
      return handleComicMetadata(request, allowedHosts, allowedOrigins, ctx);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return withCors(
        request,
        jsonResponse({ error: 'Method not allowed' }, 405),
        false,
        allowedOrigins
      );
    }

    const targetUrl = extractTargetUrl(requestUrl);

    if (!targetUrl) {
      return withCors(
        request,
        new Response(
          "Usage: /?https://dirkjan.nl/cartoon/20250314 or /?url=https://dirkjan.nl/cartoon/20250314",
          {
            status: 400,
            headers: {
              'content-type': 'text/plain; charset=UTF-8'
            }
          }
        ),
        false,
        allowedOrigins
      );
    }

    let upstreamUrl;
    try {
      upstreamUrl = new URL(targetUrl);
    } catch {
      return withCors(
        request,
        jsonResponse({ error: 'Invalid target URL' }, 400),
        false,
        allowedOrigins
      );
    }

    if (!ALLOWED_PROTOCOLS.has(upstreamUrl.protocol)) {
      return withCors(
        request,
        jsonResponse({ error: 'Unsupported protocol' }, 400),
        false,
        allowedOrigins
      );
    }

    if (!isAllowedHost(upstreamUrl.hostname, allowedHosts)) {
      return withCors(
        request,
        jsonResponse({ error: 'Host not allowed' }, 403),
        false,
        allowedOrigins
      );
    }

    try {
      const { response, cacheHit } = await fetchProxyResource(upstreamUrl, request, allowedHosts, ctx);
      return withCors(request, response, cacheHit, allowedOrigins);
    } catch (error) {
      console.error(JSON.stringify({
        message: 'upstream fetch failed',
        error: error instanceof Error ? error.message : String(error),
        targetHost: upstreamUrl.hostname
      }));
      return withCors(
        request,
        jsonResponse(
          { error: error?.name === 'TimeoutError' ? 'Upstream timed out' : 'Upstream fetch failed' },
          error?.name === 'TimeoutError' ? 504 : 502
        ),
        false,
        allowedOrigins
      );
    }

  }
};

/**
 * Identifies public comic resources without changing other shared-proxy hosts.
 * @param {URL} url - Validated upstream URL
 * @returns {boolean} Whether the comic cache policy applies
 */
function isComicResource(url) {
  return DEFAULT_ALLOWED_HOSTS.includes(url.hostname) &&
    (/^\/cartoon\/\d{8}(?:_[\w-]+)?\/?$/.test(url.pathname) ||
      url.pathname.startsWith('/wp-content/uploads/'));
}

/**
 * Keeps personalized or differently negotiated responses out of shared comic caches.
 * @param {Response} response - Response before CORS decoration
 * @returns {boolean} Whether the response is safe to share
 */
function isPublicComicResponse(response) {
  const vary = (response.headers.get('vary') || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
  return !response.headers.has('set-cookie') &&
    !/\b(private|no-store)\b/i.test(response.headers.get('cache-control') || '') &&
    vary.every(header => header === 'accept-encoding' || header === 'origin');
}

/**
 * Reads a public comic body with an enforced byte limit, even without Content-Length.
 * @param {Response} response - Upstream response
 * @returns {Promise<ArrayBuffer|null>} Bytes, or null when the limit is exceeded
 */
async function readComicBody(response) {
  if (!response.body) return new ArrayBuffer(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_CACHEABLE_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

/**
 * Returns a host-wide edge-local cooldown response, never a cacheable comic error.
 * @param {number} until - Cooldown expiry in epoch milliseconds
 * @returns {Response} Explicit HTTP 429 with the remaining wait
 */
function upstreamLimitedResponse(until) {
  const response = jsonResponse({ error: 'Upstream rate limited' }, 429);
  response.headers.set('retry-after', String(Math.max(1, Math.ceil((until - Date.now()) / 1000))));
  response.headers.set('cache-control', 'no-store');
  return response;
}

/**
 * Shares cached comic pages between HTML and metadata routes and readers at this edge.
 * @param {URL} upstreamUrl - Validated upstream URL
 * @param {Request} request - Client request
 * @param {string[]} allowedHosts - Redirect allowlist
 * @param {object} ctx - Worker execution context
 * @returns {Promise<{response: Response, cacheHit: boolean}>} Proxied resource
 */
async function fetchProxyResource(upstreamUrl, request, allowedHosts, ctx) {
  const cache = caches.default;
  const comic = isComicResource(upstreamUrl);
  const dirkjan = DEFAULT_ALLOWED_HOSTS.includes(upstreamUrl.hostname);
  const keyUrl = comic ? new URL('/-/comic-resource', request.url) : upstreamUrl;
  if (comic) keyUrl.searchParams.set('url', upstreamUrl.toString());
  const cacheKey = new Request(keyUrl, { method: 'GET' });
  const bypassCache = !comic && /no-cache|no-store/.test(request.headers.get('cache-control') || '');
  if (!bypassCache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return {
        response: request.method === 'HEAD' ? new Response(null, cached) : cached,
        cacheHit: true
      };
    }
  }

  const cooldownKey = new Request(new URL('/-/dirkjan-upstream-cooldown', request.url));
  if (dirkjan) {
    const cooldown = await cache.match(cooldownKey);
    const until = cooldown ? (await cooldown.json()).until : 0;
    if (until > Date.now()) return { response: upstreamLimitedResponse(until), cacheHit: false };
  }

  const upstream = await fetchAllowedUpstream(upstreamUrl, request, allowedHosts);
  if (dirkjan && upstream.status === 429) {
    const retryAfter = upstream.headers.get('retry-after');
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const serverUntil = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter);
    const until = Math.max(Date.now() + UPSTREAM_COOLDOWN_SECONDS * 1000, serverUntil || 0);
    await upstream.body?.cancel();
    const marker = jsonResponse({ until }, 200);
    marker.headers.set('cache-control', `public, max-age=${Math.ceil((until - Date.now()) / 1000)}`);
    await cache.put(cooldownKey, marker);
    return { response: upstreamLimitedResponse(until), cacheHit: false };
  }

  const contentLength = parseContentLength(upstream.headers.get('content-length'));
  if (contentLength !== null && contentLength > MAX_CACHEABLE_RESPONSE_BYTES) {
    await upstream.body?.cancel();
    return { response: jsonResponse({ error: 'Upstream response too large' }, 413), cacheHit: false };
  }
  let response = sanitizeUpstreamResponse(upstream);
  const publicComic = comic && response.status === 200 && isPublicComicResponse(response);
  if (request.method === 'GET' && publicComic) {
    const body = await readComicBody(response);
    if (body === null) {
      return { response: jsonResponse({ error: 'Upstream response too large' }, 413), cacheHit: false };
    }
    response = new Response(body, response);
    response.headers.delete('content-encoding');
    response.headers.set('content-length', String(body.byteLength));
    const html = upstreamUrl.pathname.startsWith('/cartoon/') ? new TextDecoder().decode(body) : null;
    const validComic = html !== null
      ? !html.includes('error404') && Boolean(extractTrustedComicImageUrl(html))
      : response.headers.get('content-type')?.startsWith('image/');
    if (validComic) {
      response.headers.set('cache-control', `public, max-age=${getCacheTtl(upstreamUrl)}`);
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
  } else if (request.method === 'GET' && upstream.ok && contentLength !== null && !bypassCache && !comic) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return { response, cacheHit: false };
}

async function handleComicMetadata(request, allowedHosts, allowedOrigins, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return withCors(request, jsonResponse({ error: 'Method not allowed' }, 405), false, allowedOrigins);
  }

  const date = new URL(request.url).searchParams.get('date') || '';
  if (!/^\d{8}$/.test(date)) {
    return withCors(request, jsonResponse({ error: 'Invalid date' }, 400), false, allowedOrigins);
  }

  const cache = caches.default;
  const metadataUrl = new URL('/-/comic-metadata', request.url);
  metadataUrl.searchParams.set('date', date);
  const cacheKey = new Request(metadataUrl);
  const cached = await cache.match(cacheKey);
  if (cached) return withCors(request, cached, true, allowedOrigins);

  let upstreamResponse;
  const pageUrl = new URL(`https://dirkjan.nl/cartoon/${date}`);
  try {
    const result = await fetchProxyResource(pageUrl, new Request(request, { method: 'GET' }), allowedHosts, ctx);
    upstreamResponse = result.response;
  } catch (error) {
    console.error(JSON.stringify({ message: 'comic metadata fetch failed', error: error.message }));
    return withCors(request, jsonResponse({ error: error?.name === 'TimeoutError' ? 'Upstream timed out' : 'Upstream fetch failed' }, error?.name === 'TimeoutError' ? 504 : 502), false, allowedOrigins);
  }

  const missingComic = () => {
    const missing = jsonResponse({ error: 'Comic not found' }, 404);
    missing.headers.set('cache-control', `public, max-age=${MISSING_COMIC_CACHE_TTL}`);
    ctx.waitUntil(cache.put(cacheKey, missing.clone()));
    return withCors(request, missing, false, allowedOrigins);
  };
  if (upstreamResponse.status === 404) {
    await upstreamResponse.body?.cancel();
    return missingComic();
  }
  if (upstreamResponse.status === 429) {
    return withCors(request, upstreamResponse, false, allowedOrigins);
  }
  if (!upstreamResponse.ok) {
    return withCors(request, jsonResponse({ error: 'Upstream fetch failed' }, 502), false, allowedOrigins);
  }

  const body = await readComicBody(upstreamResponse);
  if (body === null) {
    return withCors(request, jsonResponse({ error: 'Upstream response too large' }, 413), false, allowedOrigins);
  }
  const html = new TextDecoder().decode(body);
  if (html.includes('error404')) {
    return missingComic();
  }
  const imageUrl = extractTrustedComicImageUrl(html);
  if (!imageUrl) {
    return withCors(request, jsonResponse({ error: 'Comic image not found' }, 502), false, allowedOrigins);
  }

  const metadata = jsonResponse({ date, imageUrl }, 200);
  const publicPage = isPublicComicResponse(upstreamResponse);
  metadata.headers.set('cache-control', publicPage ? `public, max-age=${getCacheTtl(pageUrl)}` : 'no-store');
  if (publicPage) ctx.waitUntil(cache.put(cacheKey, metadata.clone()));
  return withCors(request, metadata, false, allowedOrigins);
}

function extractTrustedComicImageUrl(html) {
  const candidates = [
    html.match(/<article[^>]*class=["'][^"']*cartoon[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i)?.[1],
    html.match(/<img[^>]+src=["']([^"']*\/wp-content\/uploads\/[^"']+)["']/i)?.[1]
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate, 'https://dirkjan.nl');
      if (url.protocol === 'https:' && ['dirkjan.nl', 'www.dirkjan.nl'].includes(url.hostname.toLowerCase())) {
        return url.toString();
      }
    } catch {
      // Try the next extraction pattern.
    }
  }
  return null;
}

async function handleTelemetry(request, allowedOrigins) {
  const origin = request.headers.get('origin');
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!origin || !allowedOrigins.has(origin)) return jsonResponse({ error: 'Origin not allowed' }, 403);

  const declaredSize = parseContentLength(request.headers.get('content-length'));
  if (declaredSize !== null && declaredSize > MAX_TELEMETRY_BYTES) {
    return withCors(request, jsonResponse({ error: 'Payload too large' }, 413), false, allowedOrigins);
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_TELEMETRY_BYTES) {
    return withCors(request, jsonResponse({ error: 'Payload too large' }, 413), false, allowedOrigins);
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return withCors(request, jsonResponse({ error: 'Invalid JSON' }, 400), false, allowedOrigins);
  }

  const valid = TELEMETRY_EVENTS.has(payload?.event) &&
    typeof payload?.code === 'string' && /^[a-z0-9_-]{1,32}$/.test(payload.code) &&
    payload?.count === 1 && Object.keys(payload).length === 3;
  if (!valid) return withCors(request, jsonResponse({ error: 'Invalid event' }, 400), false, allowedOrigins);

  console.log(JSON.stringify({ message: 'browser operational event', ...payload }));
  return withCors(request, new Response(null, { status: 204 }), false, allowedOrigins);
}

async function fetchAllowedUpstream(initialUrl, request, allowedHosts) {
  let currentUrl = new URL(initialUrl);
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  ]);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const upstreamRequest = new Request(currentUrl.toString(), {
      method: request.method,
      headers: buildUpstreamHeaders(request)
    });
    const response = await fetch(upstreamRequest, {
      redirect: 'manual',
      signal,
      cf: {
        cacheEverything: request.method === 'GET',
        cacheTtlByStatus: {
          '200-299': isComicResource(currentUrl) ? -1 : getCacheTtl(currentUrl),
          '300-399': 0,
          '400-599': -1
        }
      }
    });

    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get('location');
    if (!location || redirectCount === MAX_REDIRECTS) {
      await response.body?.cancel();
      throw new Error('Upstream redirect limit exceeded');
    }

    const redirectUrl = new URL(location, currentUrl);
    if (!ALLOWED_PROTOCOLS.has(redirectUrl.protocol) || !isAllowedHost(redirectUrl.hostname, allowedHosts)) {
      await response.body?.cancel();
      throw new Error('Upstream redirect blocked');
    }

    await response.body?.cancel();
    currentUrl = redirectUrl;
  }

  throw new Error('Upstream redirect limit exceeded');
}

function parseContentLength(value) {
  if (value === null) return null;
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
}

function extractTargetUrl(requestUrl) {
  const explicitUrl = requestUrl.searchParams.get('url');
  if (explicitUrl) {
    return explicitUrl;
  }

  const rawQuery = requestUrl.search.startsWith('?')
    ? requestUrl.search.slice(1)
    : requestUrl.search;

  if (!rawQuery) {
    return null;
  }

  try {
    return decodeURIComponent(rawQuery);
  } catch {
    return rawQuery;
  }
}

function getAllowedHosts(env) {
  const rawHosts = typeof env?.ALLOWED_HOSTS === 'string'
    ? env.ALLOWED_HOSTS
    : DEFAULT_ALLOWED_HOSTS.join(',');

  return rawHosts
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean);
}

function getAllowedOrigins(env) {
  const rawOrigins = typeof env?.ALLOWED_ORIGINS === 'string'
    ? env.ALLOWED_ORIGINS
    : '';

  return new Set(
    rawOrigins
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  );
}

function getClientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

function isRateLimited(request, env) {
  const windowMs = Number.parseInt(env?.RATE_LIMIT_WINDOW_MS, 10) || DEFAULT_RATE_LIMIT_WINDOW_MS;
  const maxRequests = Number.parseInt(env?.RATE_LIMIT_MAX, 10) || DEFAULT_RATE_LIMIT_MAX_REQUESTS;
  const now = Date.now();
  const key = getClientIp(request);
  let bucket = rateLimitBuckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = { windowStart: now, count: 0 };
    rateLimitBuckets.set(key, bucket);
  }

  bucket.count += 1;
  if (rateLimitBuckets.size > 10000) {
    for (const [ip, entry] of rateLimitBuckets) {
      if (now - entry.windowStart >= windowMs) rateLimitBuckets.delete(ip);
    }
  }

  return bucket.count > maxRequests;
}

function isAllowedHost(hostname, allowedHosts) {
  const normalizedHost = hostname.toLowerCase();

  return allowedHosts.some(allowedHost => {
    if (allowedHost.startsWith('*.')) {
      const suffix = allowedHost.slice(1);
      return normalizedHost.endsWith(suffix) && normalizedHost !== suffix.slice(1);
    }

    return normalizedHost === allowedHost;
  });
}

function buildUpstreamHeaders(request) {
  const headers = new Headers();
  const accept = request.headers.get('accept');
  const acceptLanguage = request.headers.get('accept-language');
  const userAgent = request.headers.get('user-agent');

  if (accept) headers.set('accept', accept);
  if (acceptLanguage) headers.set('accept-language', acceptLanguage);
  if (userAgent) headers.set('user-agent', userAgent);

  headers.set('x-forwarded-host', new URL(request.url).host);
  headers.set('x-forwarded-proto', 'https');

  return headers;
}

function sanitizeUpstreamResponse(upstreamResponse) {
  const headers = new Headers(upstreamResponse.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  headers.set('x-proxy-by', 'dirkjanapp-corsproxy');
  headers.set('x-proxy-target', upstreamResponse.url);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers
  });
}

function getCacheTtl(targetUrl) {
  const pathname = targetUrl.pathname.toLowerCase();

  if (pathname.includes('/cartoon/')) {
    const date = pathname.match(/\/cartoon\/(\d{4})(\d{2})(\d{2})/)?.slice(1).join('-');
    if (date && Date.parse(date) < Date.now() - ARCHIVE_AGE_MS) return IMAGE_CACHE_TTL;
    return HTML_CACHE_TTL;
  }

  if (pathname.includes('/wp-content/uploads/')) {
    return IMAGE_CACHE_TTL;
  }

  return DEFAULT_CACHE_TTL;
}

function withCors(request, response, cacheHit = false, allowedOrigins = new Set()) {
  const headers = new Headers(response.headers);
  const corsHeaders = buildCorsHeaders(request, allowedOrigins);
  headers.delete('access-control-allow-origin');
  const vary = headers.get('vary');
  if (!vary?.split(',').some(value => value.trim().toLowerCase() === 'origin')) {
    headers.set('vary', vary ? `${vary}, Origin` : 'Origin');
  }

  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }

  headers.set('x-proxy-cache', cacheHit ? 'HIT' : 'MISS');

  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function buildCorsHeaders(request, allowedOrigins) {
  const origin = request.headers.get('origin');
  const headers = new Headers();

  headers.set('access-control-allow-methods', 'GET, HEAD, POST, OPTIONS');
  headers.set('access-control-allow-headers', 'Content-Type, Accept, Accept-Language');
  headers.set('access-control-expose-headers', 'Retry-After');
  headers.set('access-control-max-age', '86400');
  headers.set('timing-allow-origin', '*');

  if (origin && allowedOrigins.has(origin)) {
    headers.set('access-control-allow-origin', origin);
  } else if (!origin) {
    headers.set('access-control-allow-origin', '*');
  }

  return headers;
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8'
    }
  });
}