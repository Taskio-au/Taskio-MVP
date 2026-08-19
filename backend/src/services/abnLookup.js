'use strict';

const axios = require('axios');
const { cleanAbn } = require('../utils/abn');

const NON_CURRENT_STATUS_RE = /cancel|inactive|ceased|surrender|non[-\s]?current/;

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

/**
 * ABR AbnStatus is typically "Active" or "Cancelled".
 * Only currently Active ABNs may be marked verified. GST is ignored.
 */
function isAbnCurrentlyActive(entityStatus) {
  const status = String(entityStatus || '').trim().toLowerCase();
  if (!status) return false;
  if (NON_CURRENT_STATUS_RE.test(status)) return false;
  return status === 'active' || status.startsWith('active');
}

function categorizeAbnLookupErrorCode(code) {
  if (code === 'ABN_LOOKUP_NOT_CONFIGURED') return 'not_configured';
  if (code === 'ABN_NOT_FOUND') return 'not_found';
  if (code === 'ABN_NOT_ACTIVE') return 'not_active';
  if (code === 'ABN_LOOKUP_PARSE_ERROR' || code === 'ABN_LOOKUP_EMPTY') return 'malformed';
  if (code === 'ABN_LOOKUP_HTTP_ERROR' || code === 'ABN_LOOKUP_REQUEST_FAILED') return 'http_error';
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ERR_CANCELED') return 'timeout';
  if (code.startsWith('E') || code.startsWith('ERR_')) return 'network';
  return 'unexpected';
}

/**
 * Safe diagnostic fields for logs. Never includes GUID, Authorization,
 * query params, URLs, axios config, or the original error object.
 */
function summarizeAbnLookupError(error) {
  const code = String(error?.code || 'ABN_LOOKUP_FAILED');
  let httpStatus = null;
  if (Number.isInteger(error?.httpStatus)) {
    httpStatus = error.httpStatus;
  } else if (Number.isInteger(error?.response?.status)) {
    httpStatus = error.response.status;
  } else if (Number.isInteger(error?.status)) {
    httpStatus = error.status;
  }

  return {
    code,
    httpStatus,
    category: categorizeAbnLookupErrorCode(code),
  };
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
  let resp;
  try {
    resp = await axios.get(url, {
      params,
      timeout: 12000,
      responseType: 'text',
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Taskio-MVP/1.0 (ABN verification)',
        Accept: 'application/json,text/javascript,*/*',
      },
    });
  } catch (e) {
    const err = new Error('ABN lookup request failed.');
    err.code = 'ABN_LOOKUP_REQUEST_FAILED';
    err.httpStatus = Number.isInteger(e?.response?.status) ? e.response.status : null;
    if (typeof e?.code === 'string') err.networkCode = e.code;
    throw err;
  }

  if (resp.status !== 200) {
    const err = new Error(`ABN lookup failed (HTTP ${resp.status}).`);
    err.code = 'ABN_LOOKUP_HTTP_ERROR';
    err.httpStatus = resp.status;
    throw err;
  }

  let jsonText;
  try {
    jsonText = stripJsonp(resp.data);
  } catch (e) {
    const err = new Error('ABN lookup returned an invalid response.');
    err.code = 'ABN_LOOKUP_PARSE_ERROR';
    throw err;
  }

  let raw;
  try {
    raw = JSON.parse(jsonText);
  } catch (e) {
    const err = new Error('ABN lookup returned an invalid response.');
    err.code = 'ABN_LOOKUP_PARSE_ERROR';
    throw err;
  }

  const normalized = normalizeAbrResponse(raw);
  const notFoundMessage = normalized.message && /not\s+found|no\s+records|invalid/i.test(normalized.message);
  if (notFoundMessage) {
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

module.exports = {
  lookupAbnDetails,
  normalizeAbrResponse,
  isAbnCurrentlyActive,
  summarizeAbnLookupError,
};
