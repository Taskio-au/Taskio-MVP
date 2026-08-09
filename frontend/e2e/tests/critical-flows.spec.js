const { test, expect } = require('@playwright/test');

const HOMEOWNER_USER = {
  uid: 'homeowner-e2e-1',
  role: 'homeowner',
  claims: { role: 'homeowner' },
  token: 'e2e-homeowner-token',
  email: 'homeowner-e2e@taskio.test',
};

async function seedE2EUser(page, user = HOMEOWNER_USER) {
  await page.addInitScript((u) => {
    window.localStorage.setItem('taskio.e2e.user', JSON.stringify(u));
  }, user);
}

test('payment page shows phone verification gate when checkout requires it', async ({ page }) => {
  await seedE2EUser(page);
  await page.goto('/payment/job-1/phone-gate');

  await expect(page.getByText('Phone verification required')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify in Profile' })).toBeVisible();
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
