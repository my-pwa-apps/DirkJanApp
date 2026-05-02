const checks = [
  {
    name: 'DirkJan CORS proxy fetch',
    url: 'https://corsproxy.garfieldapp.workers.dev/?https%3A%2F%2Fdirkjan.nl%2Fcartoon%2F20260502',
    validate: async response => {
      const body = await response.text();
      return response.ok && /cartoon|wp-content|dirkjan/i.test(body);
    }
  }
];

const headers = {
  'User-Agent': 'DirkJanApp predeploy health check (+https://dirkjanapp.pages.dev)'
};

async function runCheck(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(check.url, { headers, signal: controller.signal });
    const ok = await check.validate(response);
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
