'use strict';

const axios = require('axios');

function buildApiUrl({ apiKey, model, apiVersion }) {
  const version = String(apiVersion || 'v1').trim() || 'v1';
  const m = String(model || '').trim();
  const safeModel = m || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  // The REST API expects "models/<modelName>" in the path.
  return `https://generativelanguage.googleapis.com/${version}/models/${safeModel}:generateContent?key=${apiKey}`;
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

function extractJsonObject(text) {
  // Models sometimes return extra prose; attempt to extract the first {...} block.
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model response');
  }
  const jsonSlice = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(jsonSlice);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Model response is not a JSON object');
  }
  return parsed;
}

async function generateContent({ apiKey, prompt, timeoutMs = 15000 }) {
  const apiUrl = buildApiUrl({
    apiKey,
    model: process.env.GEMINI_MODEL,
    apiVersion: process.env.GEMINI_API_VERSION,
  });
  const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  try {
    const apiResponse = await axios.post(apiUrl, payload, { timeout: timeoutMs });
    const textResponse = apiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return textResponse;
  } catch (e) {
    // Add a bit of context without leaking secrets.
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const version = process.env.GEMINI_API_VERSION || 'v1';
    const details = e?.response?.data || e?.message;
    const err = new Error(`Gemini generateContent failed (model=${model}, apiVersion=${version}).`);
    err.details = details;
    throw err;
  }
}

module.exports = { extractJsonArray, extractJsonObject, generateContent };


