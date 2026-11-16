(function initializeComicLoader(global) {
  const TRUSTED_HOSTS = ['dirkjan.nl', 'www.dirkjan.nl'];

  function createTimeoutSignal(timeoutMs) {
    if (typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(timeoutMs);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
  }

  function combineSignals(signal, timeoutSignal) {
    if (!signal) return timeoutSignal;
    if (typeof AbortSignal.any === 'function') {
      return AbortSignal.any([signal, timeoutSignal]);
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    timeoutSignal.addEventListener('abort', abort, { once: true });
    if (signal.aborted || timeoutSignal.aborted) controller.abort();
    return controller.signal;
  }

  /**
   * Waits before retrying without keeping superseded navigation requests alive.
   * @param {number} delay - Delay in milliseconds
   * @param {AbortSignal|null} signal - Navigation cancellation signal
   * @returns {Promise<void>}
   */
  function waitForRetry(delay, signal) {
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, delay);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }

  /**
   * Retries temporary throttling with bounded backoff and honors Retry-After.
   * @param {string|URL} url - Controlled proxy endpoint
   * @param {object} options - Timeout, cancellation and retry limits
   * @returns {Promise<Response>} Unconsumed response
   */
  async function fetchWithRateLimitRetry(url, options) {
    const {
      fetchTimeout,
      signal = null,
      fetchImpl = global.fetch.bind(global),
      maxRetries = 0,
      retryDelay = 0,
      maxRetryDelay = 0
    } = options;

    for (let attempt = 0; ; attempt++) {
      const response = await fetchImpl(url, {
        signal: combineSignals(signal, createTimeoutSignal(fetchTimeout)),
        mode: 'cors',
        credentials: 'omit'
      });
      if (response.status !== 429) return response;

      const retryAfter = response.headers.get('retry-after');
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const serverDelay = Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(retryAfter) - Date.now();
      const delay = Math.max(retryDelay * 2 ** attempt, Number.isFinite(serverDelay) ? serverDelay : 0);
      await response.body?.cancel();
      if (attempt >= maxRetries || delay > maxRetryDelay) {
        const error = new Error('Comic requests temporarily rate limited');
        error.name = 'RateLimitError';
        throw error;
      }
      await waitForRetry(delay, signal);
    }
  }

  /**
   * Coordinates fetches in this tab and persists cooldowns for other tabs/reloads.
   * @param {object} options - Cache limits, clock, and storage callbacks
   * @returns {object} Shared request and cooldown helpers
   */
  function createRequestCoordinator({
    cooldownMs,
    metadataTtl,
    missingTtl,
    maxEntries,
    now = Date.now,
    readCooldown = () => 0,
    writeCooldown = () => {}
  }) {
    const pending = new Map();
    const metadataCache = new Map();
    let cooldownUntil = 0;

    const remainingCooldown = () => {
      const saved = readCooldown();
      cooldownUntil = Math.max(cooldownUntil, Number.isFinite(saved) ? saved : 0);
      return Math.max(0, cooldownUntil - now());
    };
    const rateLimitError = () => {
      const error = new Error('Comic requests temporarily rate limited');
      error.name = 'RateLimitError';
      return error;
    };

    /**
     * Joins an in-flight fetch without letting one consumer cancel other consumers.
     * @param {string|URL} url - Controlled proxy endpoint
     * @param {object} options - Request timeout, retries, and cancellation signal
     * @returns {Promise<Response>} An independently consumable response
     */
    function fetchShared(url, options) {
      const { signal = null, fetchImpl = global.fetch.bind(global) } = options;
      if (signal?.aborted) return Promise.reject(signal.reason);
      const key = String(url);
      const cached = metadataCache.get(key);
      if (cached?.until > now()) return Promise.resolve(new Response(cached.body, cached.init));
      metadataCache.delete(key);
      let entry = pending.get(key);
      if (!entry) {
        if (remainingCooldown()) return Promise.reject(rateLimitError());
        const controller = new AbortController();
        entry = { controller, consumers: 0 };
        const current = entry;
        const load = async () => {
          const response = await fetchWithRateLimitRetry(url, {
            ...options,
            signal: controller.signal,
            fetchImpl: async (target, init) => {
              if (remainingCooldown()) throw rateLimitError();
              const result = await fetchImpl(target, init);
              if (result.status === 429) {
                remainingCooldown();
                const retryAfter = result.headers.get('retry-after');
                const seconds = retryAfter === null ? NaN : Number(retryAfter);
                const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now();
                cooldownUntil = Math.max(cooldownUntil, now() + (Number.isFinite(delay) ? Math.max(0, delay) : cooldownMs));
                writeCooldown(cooldownUntil);
                if (!Number.isFinite(delay)) {
                  const limited = new Response(result.body, result);
                  limited.headers.set('retry-after', String(Math.ceil(cooldownMs / 1000)));
                  return limited;
                }
              }
              return result;
            }
          });
          const body = await response.arrayBuffer();
          const init = { status: response.status, statusText: response.statusText, headers: [...response.headers] };
          if (new URL(url).pathname === '/-/comic-metadata' && (response.ok || response.status === 404)) {
            const value = response.ok ? await new Response(body, init).json() : null;
            if (!response.ok || (value?.date === new URL(url).searchParams.get('date') && normalizeComicImageUrl(value.imageUrl))) {
              metadataCache.set(key, { body, init, until: now() + (response.ok ? metadataTtl : missingTtl) });
              while (metadataCache.size > maxEntries) metadataCache.delete(metadataCache.keys().next().value);
            }
          }
          return { body, init };
        };
        entry.promise = load().finally(() => {
          if (pending.get(key) === current) pending.delete(key);
        });
        pending.set(key, entry);
      }

      entry.consumers++;
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          entry.consumers--;
          if (!entry.consumers && pending.get(key) === entry) {
            pending.delete(key);
            entry.controller.abort();
          }
          if (error) reject(error);
          else resolve(new Response(value.body, value.init));
        };
        const onAbort = () => finish(signal.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        entry.promise.then(value => finish(null, value), error => finish(error));
        if (signal?.aborted) onAbort();
      });
    }

    return Object.freeze({
      fetch: fetchShared,
      isCoolingDown: () => remainingCooldown() > 0
    });
  }

  /**
   * Resolves a comic image URL and restricts it to trusted DirkJan origins.
   * @param {string} candidateUrl
   * @returns {string|null}
   */
  function normalizeComicImageUrl(candidateUrl) {
    try {
      const parsedUrl = new URL(candidateUrl, 'https://dirkjan.nl');
      if (parsedUrl.protocol !== 'https:') return null;
      if (!TRUSTED_HOSTS.includes(parsedUrl.hostname.toLowerCase())) return null;
      return parsedUrl.toString();
    } catch {
      return null;
    }
  }

  /**
   * Extracts the comic image URL from a dirkjan.nl HTML page.
   * @param {string} html
   * @returns {string|null}
   */
  function extractComicImageUrl(html) {
    const articleMatch = html.match(/<article class="cartoon"[^>]*>([\s\S]*?)<\/article>/);
    if (articleMatch) {
      const imgMatch = articleMatch[1].match(/<img[^>]+src=["']([^"']+)["']/);
      if (imgMatch && imgMatch[1]) {
        return normalizeComicImageUrl(imgMatch[1]);
      }
    }

    const directMatch = html.match(/<article class="cartoon"[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/);
    if (directMatch && directMatch[1]) {
      return normalizeComicImageUrl(directMatch[1]);
    }

    const wpMatch = html.match(/https?:\/\/dirkjan\.nl\/wp-content\/uploads\/[^"'\s]+\.(?:jpg|jpeg|png|gif)/i);
    if (wpMatch) {
      return normalizeComicImageUrl(wpMatch[0]);
    }

    const cartoonPos = html.indexOf('<article class="cartoon">');
    if (cartoonPos !== -1) {
      const startPos = cartoonPos + 41;
      const substring = html.substring(startPos, startPos + 200);
      const endPos = substring.indexOf('"');
      if (endPos > 0) {
        return normalizeComicImageUrl(html.substring(startPos, startPos + endPos));
      }
    }

    return null;
  }

  /**
   * Small in-memory blob-URL cache keyed by comic date.
   * @param {{ maxSize?: number, revokeUrl?: Function }} [options]
   */
  function createComicBlobCache({ maxSize = 20, revokeUrl = URL.revokeObjectURL.bind(URL) } = {}) {
    const cache = new Map();

    function revoke(entry) {
      if (entry?.objectUrl) {
        try { revokeUrl(entry.objectUrl); } catch (_) { /* ignore stale URLs */ }
      }
    }

    function evictOldest() {
      while (cache.size > maxSize) {
        const oldestKey = cache.keys().next().value;
        revoke(cache.get(oldestKey));
        cache.delete(oldestKey);
      }
    }

    return Object.freeze({
      has(date) {
        return cache.has(date);
      },

      get(date) {
        return cache.get(date) || null;
      },

      consume(date) {
        const entry = cache.get(date);
        if (!entry) return null;
        cache.delete(date);
        return entry;
      },

      put(date, entry) {
        const existing = cache.get(date);
        if (existing && existing !== entry) revoke(existing);
        cache.delete(date);
        cache.set(date, entry);
        evictOldest();
      },

      size() {
        return cache.size;
      },

      clear() {
        for (const entry of cache.values()) revoke(entry);
        cache.clear();
      }
    });
  }

  /**
   * Fetches a comic image through the controlled proxy and returns a local blob URL.
   * @param {string} imageUrl
   * @param {{ fetchWithFallback: Function, minImageSize: number, signal?: AbortSignal, createObjectUrl?: Function }} options
   * @returns {Promise<string>}
   */
  async function createComicObjectUrl(imageUrl, options) {
    const {
      fetchWithFallback,
      minImageSize,
      signal = null,
      createObjectUrl = URL.createObjectURL.bind(URL)
    } = options;
    const response = await fetchWithFallback(imageUrl, signal);
    const blob = await response.blob();

    if (!blob.type.startsWith('image/') || blob.size < minImageSize) {
      throw new Error('Proxy returned an invalid comic image');
    }

    return createObjectUrl(blob);
  }

  /**
   * Loads comic metadata, falling back to HTML extraction.
   * @param {string} date
   * @param {string} pageUrl
   * @param {AbortSignal|null} signal
   * @param {object} options
   */
  async function fetchComicData(date, pageUrl, signal, options) {
    const {
      metadataEndpoint,
      fetchTimeout,
      fetchWithFallback,
      retryOptions = {},
      fetchRequest = fetchWithRateLimitRetry,
      fetchImpl = global.fetch.bind(global)
    } = options;

    try {
      const metadataUrl = new URL(metadataEndpoint);
      metadataUrl.searchParams.set('date', date);
      const response = await fetchRequest(metadataUrl, {
        ...retryOptions, fetchTimeout, signal, fetchImpl
      });
      if (response.status === 404) return { notFound: true, imageUrl: null };
      if (!response.ok) {
        const error = new Error(`Metadata request failed: ${response.status}`);
        error.name = 'MetadataError';
        throw error;
      }
      const metadata = await response.json();
      const imageUrl = metadata.date === date ? normalizeComicImageUrl(metadata.imageUrl) : null;
      if (!imageUrl) throw new Error('Invalid comic metadata');
      return { notFound: false, imageUrl };
    } catch (error) {
      if (['AbortError', 'RateLimitError', 'MetadataError', 'TimeoutError'].includes(error.name)) throw error;
      const response = await fetchWithFallback(pageUrl, signal);
      const html = await response.text();
      return {
        notFound: html.includes('error404'),
        imageUrl: extractComicImageUrl(html)
      };
    }
  }

  /**
   * Returns a cached blob URL for the date when it still matches the image, else fetches a new one.
   * @param {string} date
   * @param {string} imageUrl
   * @param {object} cache
   * @param {AbortSignal|null} signal
   * @param {object} objectUrlOptions
   * @returns {Promise<string>}
   */
  async function resolveDisplayUrl(date, imageUrl, cache, signal, objectUrlOptions) {
    const cached = cache.consume(date);
    if (cached?.objectUrl && cached.imageUrl === imageUrl) {
      return cached.objectUrl;
    }
    if (cached?.objectUrl) {
      try { URL.revokeObjectURL(cached.objectUrl); } catch (_) { /* ignore */ }
    }
    return createComicObjectUrl(imageUrl, { ...objectUrlOptions, signal });
  }

  /**
   * Loads and decodes an image before it is committed to the page, so transitions
   * never animate a blank or broken frame.
   * @param {string} imageUrl
   * @param {{ timeoutMs?: number, signal?: AbortSignal|null, ImageCtor?: Function }} [options]
   * @returns {Promise<{ width: number, height: number }>}
   */
  function decodeComicImage(imageUrl, { timeoutMs = 8000, signal = null, ImageCtor = global.Image } = {}) {
    return new Promise((resolve, reject) => {
      const abortError = () => new DOMException('Aborted', 'AbortError');
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const image = new ImageCtor();
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        image.onload = null;
        image.onerror = null;
        if (error) reject(error);
        else resolve(result);
      };
      const onAbort = () => finish(abortError());
      const onReady = async () => {
        if (!image.naturalWidth) {
          finish(new Error('Comic image is empty'));
          return;
        }
        // Firefox rejects decode() for renderable images with trailing bytes; the load already proved them valid.
        if (typeof image.decode === 'function') {
          try { await image.decode(); } catch (_) { /* best-effort pre-decode */ }
        }
        finish(null, { width: image.naturalWidth, height: image.naturalHeight });
      };
      const timer = setTimeout(() => finish(new Error('Comic image decode timed out')), timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      image.onload = onReady;
      image.onerror = () => finish(new Error('Comic image failed to decode'));
      image.src = imageUrl;
    });
  }

  global.COMIC_LOADER = Object.freeze({
    createRequestCoordinator,
    fetchWithRateLimitRetry,
    extractComicImageUrl,
    normalizeComicImageUrl,
    createComicBlobCache,
    createComicObjectUrl,
    decodeComicImage,
    fetchComicData,
    resolveDisplayUrl
  });
})(globalThis);
