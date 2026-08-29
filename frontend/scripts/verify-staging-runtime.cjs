'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('../node_modules/@playwright/test');

const buildDir = path.resolve(__dirname, '..', 'build');

function contentType(filePath) {
  if (filePath.endsWith('.js')) return 'application/javascript';
  if (filePath.endsWith('.css')) return 'text/css';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const relative = urlPath === '/' ? '/index.html' : urlPath;
      const filePath = path.join(buildDir, relative);
      const safeBase = path.resolve(buildDir);
      if (!path.resolve(filePath).startsWith(safeBase)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const serve = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
        ? filePath
        : path.join(buildDir, 'index.html');
      res.writeHead(200, { 'Content-Type': contentType(serve) });
      fs.createReadStream(serve).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    throw new Error('Staging build is missing; run the staging build first.');
  }
  const server = await startServer();
  const { port } = server.address();
    const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => typeof window.__TASKIO_PHONE_RECAPTCHA_TESTING_BYPASS__ === 'boolean',
      null,
      { timeout: 30000 },
    );
    const bypass = await page.evaluate(() => window.__TASKIO_PHONE_RECAPTCHA_TESTING_BYPASS__);
    if (bypass === true) {
      throw new Error('auth.settings.appVerificationDisabledForTesting was true in the staging production build.');
    }
    process.stdout.write('[staging-runtime] phone recaptcha testing bypass is not true\n');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error('[staging-runtime]', err && err.message);
  process.exit(1);
});
