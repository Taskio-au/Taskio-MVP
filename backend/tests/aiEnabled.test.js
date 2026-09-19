'use strict';

const {
  isAiDescriptionEnabled,
  hasGeminiApiKey,
  canCallGeminiProvider,
} = require('../src/config/aiEnabled');

describe('AI_DESCRIPTION_ENABLED fail-closed helper', () => {
  const original = {};

  beforeEach(() => {
    ['AI_DESCRIPTION_ENABLED', 'GEMINI_API_KEY'].forEach((key) => {
      original[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    ['AI_DESCRIPTION_ENABLED', 'GEMINI_API_KEY'].forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['false', 'false'],
    ['FALSE', 'FALSE'],
    ['TRUE', 'TRUE'],
    ['true with space', 'true '],
    ['1', '1'],
    ['yes', 'yes'],
    ['on', 'on'],
  ])('treats %s as disabled', (_label, value) => {
    if (value === undefined) delete process.env.AI_DESCRIPTION_ENABLED;
    else process.env.AI_DESCRIPTION_ENABLED = value;
    process.env.GEMINI_API_KEY = 'present-but-must-not-enable';
    expect(isAiDescriptionEnabled()).toBe(false);
    expect(canCallGeminiProvider()).toBe(false);
  });

  it('enables provider use only for exact true plus a key', () => {
    process.env.AI_DESCRIPTION_ENABLED = 'true';
    process.env.GEMINI_API_KEY = 'present';
    expect(isAiDescriptionEnabled()).toBe(true);
    expect(hasGeminiApiKey()).toBe(true);
    expect(canCallGeminiProvider()).toBe(true);
  });

  it('does not call the provider when the flag is true but the key is missing', () => {
    process.env.AI_DESCRIPTION_ENABLED = 'true';
    delete process.env.GEMINI_API_KEY;
    expect(canCallGeminiProvider()).toBe(false);
  });

  it('does not infer enablement from GEMINI_API_KEY alone', () => {
    process.env.AI_DESCRIPTION_ENABLED = 'false';
    process.env.GEMINI_API_KEY = 'present-but-disabled';
    expect(isAiDescriptionEnabled()).toBe(false);
    expect(hasGeminiApiKey()).toBe(true);
    expect(canCallGeminiProvider()).toBe(false);
  });
});
