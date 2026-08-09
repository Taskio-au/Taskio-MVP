'use strict';

const axios = require('axios');
const { cleanAbn } = require('../utils/abn');

function stripJsonp(body) {
  const s = String(body || '').trim();
  if (!s) throw new Error('empty_response');
  if (s.startsWith('{') || s.startsWith('[')) return s;

  // JSONP: callbackName({...})
  const m = s.match(/^[a-zA-Z_$][\w$]*\(([\s\S]*)\)\s*;?\s*$/);
  if (m && m[1]) return m[1].trim();
  return s;
}

function normalizeAbrResponse(raw) {
  // ABR JSON format can vary; normalize a few fields we care about.
  const abn = String(raw?.Abn || raw?.abn || '').trim();
  const entityName =
    String(raw?.EntityName || raw?.entityName || raw?.MainName || raw?.mainName || raw?.BusinessName || '').trim();
  const entityTypeName = String(raw?.EntityTypeName || raw?.entityTypeName || '').trim();
  const entityStatus = String(raw?.EntityStatus || raw?.entityStatus || raw?.AbnStatus || raw?.abnStatus || '').trim();
  const gst = String(raw?.Gst || raw?.gst || raw?.GstStatus || raw?.gstStatus || '').trim();
  const message = String(raw?.Message || raw?.message || '').trim();

  return { abn, entityName, entityTypeName, entityStatus, gst, message, raw };
}

async function lookupAbnDetails(abnInput) {
  const guid = String(process.env.ABN_LOOKUP_GUID || '').trim();
  if (!guid) {
    const err = new Error('ABN lookup is not configured (missing ABN_LOOKUP_GUID).');
    err.code = 'ABN_LOOKUP_NOT_CONFIGURED';
    throw err;
  }

  const abn = cleanAbn(abnInput);
  const url = 'https://abr.business.gov.au/json/AbnDetails.aspx';

  // Use JSONP explicitly to avoid any content-type quirks; we strip it server-side.
  const params = { abn, guid, callback: 'taskio' };
  const resp = await axios.get(url, {
    params,
    timeout: 12000,
    responseType: 'text',
    validateStatus: () => true,
    headers: {
      'User-Agent': 'Taskio-MVP/1.0 (ABN verification)',
      Accept: 'application/json,text/javascript,*/*',
    },
  });

  if (resp.status !== 200) {
    const err = new Error(`ABN lookup failed (HTTP ${resp.status}).`);
    err.code = 'ABN_LOOKUP_HTTP_ERROR';
    err.httpStatus = resp.status;
    throw err;
  }

  const jsonText = stripJsonp(resp.data);
  let raw;
  try {
    raw = JSON.parse(jsonText);
  } catch (e) {
    const err = new Error('ABN lookup returned an invalid response.');
    err.code = 'ABN_LOOKUP_PARSE_ERROR';
    err.preview = String(resp.data || '').slice(0, 250);
    throw err;
  }

  const normalized = normalizeAbrResponse(raw);
  if (normalized.message && /not\s+found|invalid/i.test(normalized.message)) {
    const err = new Error('ABN not found on the Australian Business Register.');
    err.code = 'ABN_NOT_FOUND';
    throw err;
  }
  if (!normalized.abn) {
    const err = new Error('ABN lookup did not return an ABN.');
    err.code = 'ABN_LOOKUP_EMPTY';
    throw err;
  }

  return normalized;
}

module.exports = { lookupAbnDetails };






