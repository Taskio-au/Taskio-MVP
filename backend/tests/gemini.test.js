'use strict';

jest.mock('axios', () => ({
  post: jest.fn(),
}));

const axios = require('axios');
const { buildApiUrl, generateContent } = require('../src/services/gemini');

describe('Gemini REST configuration', () => {
  const originalModel = process.env.GEMINI_MODEL;
  const originalVersion = process.env.GEMINI_API_VERSION;

  beforeEach(() => {
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_API_VERSION;
    axios.post.mockReset();
  });

  afterAll(() => {
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
    if (originalVersion === undefined) delete process.env.GEMINI_API_VERSION;
    else process.env.GEMINI_API_VERSION = originalVersion;
  });

  it('uses the stable Gemini 3.6 Flash model on the existing REST v1 endpoint', () => {
    expect(buildApiUrl({ apiKey: 'test-key' })).toBe(
      'https://generativelanguage.googleapis.com/v1/models/gemini-3.6-flash:generateContent?key=test-key'
    );
  });

  it('posts the compatible generateContent payload without a live API call', async () => {
    axios.post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: 'local mock response' }] } }] },
    });

    await expect(generateContent({
      apiKey: 'test-key',
      prompt: 'Return a short response.',
    })).resolves.toBe('local mock response');

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/v1/models/gemini-3.6-flash:generateContent'),
      { contents: [{ role: 'user', parts: [{ text: 'Return a short response.' }] }] },
      { timeout: 15000 }
    );
  });
});
