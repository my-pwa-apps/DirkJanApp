const checks = [
  {
    name: 'DirkJan CORS proxy fetch',
    url: 'https://corsproxy.garfieldapp.workers.dev/?https%3A%2F%2Fdirkjan.nl%2Fcartoon%2F20260502',
    validate: async response => {
      const body = await response.text();
      return response.ok && /cartoon|wp-content|dirkjan/i.test(body);
    }
  },
  {
    name: 'DirkJan comic metadata fetch',
    url: 'https://corsproxy.garfieldapp.workers.dev/-/comic-metadata?date=20260502',
    validate: async response => {
      const body = await response.json();
      if (!response.ok || body.date !== '20260502' || !/^https:\/\/(?:www\.)?dirkjan\.nl\//.test(body.imageUrl)) {
        return false;
      }
      const image = await fetch(`https://corsproxy.garfieldapp.workers.dev/?${encodeURIComponent(body.imageUrl)}`, {
        headers, signal: AbortSignal.timeout(20_000)
      });
      return image.ok &&
        image.headers.get('access-control-allow-origin') === headers.Origin &&
        image.headers.get('content-type')?.startsWith('image/') &&
        (await image.arrayBuffer()).byteLength >= 400;
    }
  }
];

const headers = {
  Origin: 'https://dirkjanapp.pages.dev',
  'User-Agent': 'DirkJanApp predeploy health check (+https://dirkjanapp.pages.dev)'
};

async function runCheck(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(check.url, { headers, signal: controller.signal });
    const ok = response.headers.get('access-control-allow-origin') === headers.Origin &&
      await check.validate(response);
    if (!ok) {
      throw new Error(`${check.name} failed with HTTP ${response.status}`);
    }
    console.log(`${check.name}: OK`);
  } finally {
    clearTimeout(timeout);
  }
}

Promise.all(checks.map(runCheck)).catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
