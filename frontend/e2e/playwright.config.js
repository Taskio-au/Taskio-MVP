const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/mock-server.js',
      cwd: projectRoot,
      port: 3800,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm start',
      cwd: projectRoot,
      port: 3100,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        BROWSER: 'none',
        PORT: '3100',
        REACT_APP_E2E_AUTH_BYPASS: 'true',
        REACT_APP_API_BASE_URL: 'http://127.0.0.1:3800',
        REACT_APP_STRIPE_PUBLISHABLE_KEY: 'pk_test_taskio_e2e',
      },
    },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
