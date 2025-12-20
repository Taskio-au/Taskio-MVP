'use strict';

const axios = require('axios');

function buildApiUrl(apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
}

function extractJsonArray(text) {
  // Models sometimes return extra prose; attempt to extract the first [...] block.
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON array found in model response');
  }
  const jsonSlice = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(jsonSlice);
  if (!Array.isArray(parsed)) throw new Error('Model response is not a JSON array');
  return parsed;
}

async function generateContent({ apiKey, prompt, timeoutMs = 15000 }) {
  const apiUrl = buildApiUrl(apiKey);
  const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  const apiResponse = await axios.post(apiUrl, payload, { timeout: timeoutMs });
  const textResponse = apiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return textResponse;
}

module.exports = { extractJsonArray, generateContent };


