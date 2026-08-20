(function initializeTelemetry(global) {
  const ALLOWED_EVENTS = new Set([
    'comic_parse_failed',
    'proxy_exhausted',
    'service_worker_failed',
    'storage_failed'
  ]);
  const ENDPOINT = 'https://corsproxy.garfieldapp.workers.dev/-/telemetry';

  function createTelemetry(options = {}) {
    const sampleRate = options.sampleRate ?? 0.01;
    const random = options.random || Math.random;
    const send = options.send || ((payload) => fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
      keepalive: true
    }));

    return Object.freeze({
      report(event, code = 'unknown') {
        if (!ALLOWED_EVENTS.has(event) || !/^[a-z0-9_-]{1,32}$/.test(code)) return false;
        if (random() >= sampleRate) return false;
        Promise.resolve(send({ event, code, count: 1 })).catch(() => {});
        return true;
      }
    });
  }

  global.createTelemetry = createTelemetry;
  global.TELEMETRY = createTelemetry();
})(globalThis);