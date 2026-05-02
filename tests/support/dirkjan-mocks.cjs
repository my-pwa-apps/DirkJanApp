const { expect } = require('@playwright/test');

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8WU3wAAAABJRU5ErkJggg==',
  'base64'
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function comicHtml(targetUrl = 'https://dirkjan.nl/cartoon/20260502') {
  const dateMatch = targetUrl.match(/(\d{8})/);
  const date = dateMatch ? dateMatch[1] : '20260502';
  const imageUrl = `https://dirkjan.nl/wp-content/uploads/${date}-dirkjan-test.png`;

  return `<!doctype html><html><body><article class="cartoon"><img src="${imageUrl}" alt="DirkJan ${date}"></article></body></html>`;
}

function notFoundHtml() {
  return '<!doctype html><html><body class="error404"><main>Niet gevonden</main></body></html>';
}

async function mockExternalServices(page, options = {}) {
  const context = page.context();
  const proxyFailuresRemaining = { count: options.proxyFailures || 0 };
  const proxyRequests = [];
  const unavailableDates = new Set(options.unavailableDates || []);

  const fulfillComicPage = route => {
    const requestUrl = new URL(route.request().url());
    const targetUrl = requestUrl.hostname === 'corsproxy.garfieldapp.workers.dev'
      ? decodeURIComponent(requestUrl.search.slice(1))
      : route.request().url();
    const date = targetUrl.match(/(\d{8})/)?.[1];
    proxyRequests.push(targetUrl);

    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: unavailableDates.has(date) ? notFoundHtml() : comicHtml(targetUrl),
      headers: corsHeaders
    });
  };

  await context.route('https://static.cloudflareinsights.com/**', route => {
    route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: '', headers: corsHeaders });
  });

  await context.route('**/{favicon-16x16.webp,favicon-32x32.webp,apple-touch-icon.webp,android-chrome-192x192.webp}', route => {
    route.fulfill({ status: 200, contentType: 'image/webp', body: transparentPng, headers: corsHeaders });
  });

  await context.route('https://dirkjan.nl/wp-content/uploads/**', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng, headers: corsHeaders });
  });

  await context.route('https://corsproxy.garfieldapp.workers.dev/**', route => {
    const requestUrl = new URL(route.request().url());
    const targetUrl = decodeURIComponent(requestUrl.search.slice(1));

    if (proxyFailuresRemaining.count > 0) {
      proxyFailuresRemaining.count -= 1;
      proxyRequests.push(targetUrl);
      route.fulfill({ status: 502, contentType: 'text/plain; charset=utf-8', body: 'proxy failure', headers: corsHeaders });
      return;
    }

    fulfillComicPage(route);
  });

  await context.route('https://api.codetabs.com/**', route => {
    fulfillComicPage(route);
  });

  await context.route('https://api.allorigins.win/**', route => {
    fulfillComicPage(route);
  });

  return { proxyRequests };
}

async function openApp(page, options = {}) {
  await page.addInitScript(initialStorage => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: () => Promise.resolve({
          update: () => Promise.resolve(),
          addEventListener: () => {}
        }),
        addEventListener: () => {},
        getRegistration: () => Promise.resolve(null)
      },
      configurable: true
    });

    try {
      localStorage.clear();
      const storageEntries = initialStorage || { lastdate: 'false' };
      Object.entries(storageEntries).forEach(([key, value]) => localStorage.setItem(key, value));
    } catch {
      // Some browser engines restrict storage before the document origin exists.
    }
  }, options.initialStorage || null);

  const requestLog = await mockExternalServices(page, options);
  const errors = [];

  page.on('pageerror', error => {
    const message = error.message;
    if (!message.includes('The object is in an invalid state.')) {
      errors.push(message);
    }
  });
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' &&
        !text.startsWith('Failed to load resource:') &&
        !text.includes('Image corrupt or truncated') &&
        !text.includes('Cross-Origin Request Blocked') &&
        !text.includes('ServiceWorker passed a promise')) {
      errors.push(text);
    }
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);
  await expect(page.locator('#comic')).not.toHaveAttribute('src', /^$/);

  return { ...requestLog, errors };
}

module.exports = {
  comicHtml,
  mockExternalServices,
  notFoundHtml,
  openApp,
  transparentPng
};
