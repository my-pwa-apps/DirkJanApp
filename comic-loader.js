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
      fetchImpl = global.fetch.bind(global)
    } = options;

    try {
      const metadataUrl = new URL(metadataEndpoint);
      metadataUrl.searchParams.set('date', date);
      const timeoutSignal = createTimeoutSignal(fetchTimeout);
      const response = await fetchImpl(metadataUrl, {
        signal: combineSignals(signal, timeoutSignal)
      });
      if (response.status === 404) return { notFound: true, imageUrl: null };
      if (!response.ok) throw new Error(`Metadata request failed: ${response.status}`);
      const metadata = await response.json();
      const imageUrl = metadata.date === date ? normalizeComicImageUrl(metadata.imageUrl) : null;
      if (!imageUrl) throw new Error('Invalid comic metadata');
      return { notFound: false, imageUrl };
    } catch (error) {
      if (error.name === 'AbortError') throw error;
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

  global.COMIC_LOADER = Object.freeze({
    extractComicImageUrl,
    normalizeComicImageUrl,
    createComicBlobCache,
    createComicObjectUrl,
    fetchComicData,
    resolveDisplayUrl
  });
})(globalThis);
