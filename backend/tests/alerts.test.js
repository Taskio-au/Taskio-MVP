'use strict';

jest.mock('axios', () => ({
  post: jest.fn(),
}));

const axios = require('axios');
const { sendCriticalAlert } = require('../src/observability/alerts');

describe('sendCriticalAlert', () => {
  const originalWebhook = process.env.ALERT_WEBHOOK_URL;

  afterAll(() => {
    if (originalWebhook === undefined) {
      delete process.env.ALERT_WEBHOOK_URL;
    } else {
      process.env.ALERT_WEBHOOK_URL = originalWebhook;
    }
  });

  beforeEach(() => {
    delete process.env.ALERT_WEBHOOK_URL;
    axios.post.mockReset();
  });

  it('safely no-ops when ALERT_WEBHOOK_URL is not configured', async () => {
    await expect(
      sendCriticalAlert({
        title: 'unit-test-alert',
        message: 'should not be forwarded',
      })
    ).resolves.toBeUndefined();

    expect(axios.post).not.toHaveBeenCalled();
  });
});
