const { test, expect } = require('@playwright/test');

const HOMEOWNER_USER = {
  uid: 'homeowner-e2e-1',
  role: 'homeowner',
  claims: { role: 'homeowner' },
  token: 'e2e-homeowner-token',
  email: 'homeowner-e2e@taskio.test',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.protocol === 'data:' || url.protocol === 'blob:') {
      return route.continue();
    }
    return route.abort('blockedbyclient');
  });
});

async function seedE2EUser(page, user = HOMEOWNER_USER) {
  await page.addInitScript((u) => {
    window.localStorage.setItem('taskio.e2e.user', JSON.stringify(u));
  }, user);
}

test('payment page shows the account verification gate when checkout requires it', async ({ page }) => {
  await seedE2EUser(page);
  await page.goto('/payment/job-1/phone-gate');

  await expect(page.getByText('Finish account setup to pay')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue setup' })).toBeVisible();
});

test('critical flow harness runs lifecycle and flags risky message content', async ({ page }) => {
  await seedE2EUser(page);
  await page.goto('/e2e/critical-flows');

  await page.getByRole('button', { name: 'Run Lifecycle' }).click();

  const timeline = page.getByTestId('lifecycle-timeline');
  await expect(timeline).toContainText('start -> in_escrow');
  await expect(timeline).toContainText('flag_dispute -> disputed');
  await expect(timeline).toContainText('clear_dispute -> in_escrow');
  await expect(timeline).toContainText('manual_release -> released');

  await page.getByLabel('Message text').fill('Please contact me on +61 412 345 678 or me@example.com');
  await page.getByRole('button', { name: 'Analyze Message' }).click();

  const flags = page.getByTestId('message-flags');
  await expect(flags).toContainText('phone_number:HIGH');
  await expect(flags).toContainText('email_address:HIGH');
});

test('public launch page labels examples and exposes route metadata without fictional testimonials', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');

  await expect(page).toHaveTitle(/Taskio/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://taskio.com.au');
  await expect(page.getByText('Illustrative example').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Clients and Experts in their own words/i })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('task brief accepts multiple category items, quantities, and a custom item', async ({ page }) => {
  await page.goto('/post-job');

  await page.getByRole('button', { name: 'Mounting' }).click();
  await page.getByRole('checkbox', { name: /TV mounting/i }).check();
  await page.getByRole('checkbox', { name: /Shelves/i }).check();
  await page.getByLabel('TV mounting quantity').fill('2');
  await page.getByLabel('Shelves quantity').fill('3');
  await page.getByRole('checkbox', { name: /Something else within this category/i }).check();
  await page.getByLabel('Custom task item description').fill('Mount a lightweight indoor noticeboard');
  await page.getByLabel('Something else within this category quantity').fill('4');
  await page.getByLabel('Description *').fill('Mount the selected items securely on an indoor plaster wall.');

  await expect(page.getByLabel('TV mounting quantity')).toHaveValue('2');
  await expect(page.getByLabel('Shelves quantity')).toHaveValue('3');
  await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
});
