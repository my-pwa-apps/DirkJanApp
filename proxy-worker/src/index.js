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
const IMAGE_CACHE_TTL = 86400;
const DEFAULT_CACHE_TTL = 3600;
const UPSTREAM_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;
const MAX_CACHEABLE_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_TELEMETRY_BYTES = 1024;
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

    const cacheKey = new Request(upstreamUrl.toString(), { method: request.method });
    const cache = caches.default;
    const clientCacheControl = request.headers.get('cache-control') || '';
    const bypassCache = clientCacheControl.includes('no-cache') || clientCacheControl.includes('no-store');

    if (request.method === 'GET' && !bypassCache) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return withCors(request, cached, true, allowedOrigins);
      }
    }

    let upstreamResponse;
    try {
      upstreamResponse = await fetchAllowedUpstream(upstreamUrl, request, allowedHosts);
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

    const contentLength = parseContentLength(upstreamResponse.headers.get('content-length'));
    if (contentLength !== null && contentLength > MAX_CACHEABLE_RESPONSE_BYTES) {
      await upstreamResponse.body?.cancel();
      return withCors(
        request,
        jsonResponse({ error: 'Upstream response too large' }, 413),
        false,
        allowedOrigins
      );
    }

    const response = sanitizeUpstreamResponse(upstreamResponse);

    if (request.method === 'GET' && upstreamResponse.ok && contentLength !== null && !bypassCache) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return withCors(request, response, false, allowedOrigins);
  }
};

async function handleComicMetadata(request, allowedHosts, allowedOrigins, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return withCors(request, jsonResponse({ error: 'Method not allowed' }, 405), false, allowedOrigins);
  }

  const date = new URL(request.url).searchParams.get('date') || '';
  if (!/^\d{8}$/.test(date)) {
    return withCors(request, jsonResponse({ error: 'Invalid date' }, 400), false, allowedOrigins);
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: request.method });
  const bypassCache = /no-cache|no-store/.test(request.headers.get('cache-control') || '');
  if (!bypassCache) {
    const cached = await cache.match(cacheKey);
    if (cached) return withCors(request, cached, true, allowedOrigins);
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetchAllowedUpstream(new URL(`https://dirkjan.nl/cartoon/${date}`), request, allowedHosts);
  } catch (error) {
    return withCors(request, jsonResponse({ error: error?.name === 'TimeoutError' ? 'Upstream timed out' : 'Upstream fetch failed' }, error?.name === 'TimeoutError' ? 504 : 502), false, allowedOrigins);
  }

  if (upstreamResponse.status === 404) {
    return withCors(request, jsonResponse({ error: 'Comic not found' }, 404), false, allowedOrigins);
  }
  if (!upstreamResponse.ok) {
    return withCors(request, jsonResponse({ error: 'Upstream fetch failed' }, 502), false, allowedOrigins);
  }

  const html = await upstreamResponse.text();
  if (html.includes('error404')) {
    return withCors(request, jsonResponse({ error: 'Comic not found' }, 404), false, allowedOrigins);
  }
  const imageUrl = extractTrustedComicImageUrl(html);
  if (!imageUrl) {
    return withCors(request, jsonResponse({ error: 'Comic image not found' }, 502), false, allowedOrigins);
  }

  const metadata = jsonResponse({ date, imageUrl }, 200);
  metadata.headers.set('cache-control', `public, max-age=${HTML_CACHE_TTL}`);
  if (request.method === 'GET' && !bypassCache) ctx.waitUntil(cache.put(cacheKey, metadata.clone()));
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
          '200-299': getCacheTtl(currentUrl),
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
  headers.set('vary', 'Origin');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers
  });
}

function getCacheTtl(targetUrl) {
  const pathname = targetUrl.pathname.toLowerCase();

  if (pathname.includes('/cartoon/')) {
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

  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }

  headers.set('x-proxy-cache', cacheHit ? 'HIT' : 'MISS');

  return new Response(response.body, {
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