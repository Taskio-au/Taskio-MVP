'use strict';

/**
 * Authoritative server-side Gemini / AI-provider kill switch.
 *
 * AI_DESCRIPTION_ENABLED:
 *   exact "true" => provider calls may occur when a Gemini key is also present
 *   missing / any other value => fail closed (local fallback only)
 *
 * A GEMINI_API_KEY must never imply enablement. Production default is OFF.
 * This flag gates every Gemini network call (description tidy and quote assistant).
 */

function isAiDescriptionEnabled(env = process.env) {
  return env.AI_DESCRIPTION_ENABLED === 'true';
}

function hasGeminiApiKey(env = process.env) {
  return typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.trim().length > 0;
}

function canCallGeminiProvider(env = process.env) {
  return isAiDescriptionEnabled(env) && hasGeminiApiKey(env);
}

module.exports = {
  isAiDescriptionEnabled,
  hasGeminiApiKey,
  canCallGeminiProvider,
};
