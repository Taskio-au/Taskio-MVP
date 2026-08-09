import { validateDob } from '../../utils/profileCompliance';

export function normalizeBusinessName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function normalizeAbn(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

export function dobPayloadFromInput(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map((x) => Number(x));
  return { day: d, month: m, year: y };
}

export function validateTradieDobOnSave(draftDob) {
  if (!draftDob) return '';
  const dobValidation = validateDob(draftDob);
  if (!dobValidation.valid) return dobValidation.error || 'Date of birth is invalid.';
  if (!dobValidation.isAdult) return 'You must be 18 or older to use Taskio as an Expert.';
  return '';
}

export function computeTradieFieldErrors({ businessNameRequired, abnRequired, businessName, abn }) {
  return {
    businessNameError: businessNameRequired && !businessName ? 'Business name is required for your business type.' : '',
    abnError: abnRequired && !abn ? 'ABN is required for your business type.' : '',
  };
}

export function buildTradieProfilePayload({
  businessName,
  bio,
  draftServiceLocation,
  draftDob,
  draftBusinessType,
  showAbn,
  abn,
  confirmedLock,
}) {
  const payload = { bio };
  if (businessName) payload.businessName = businessName;
  if (draftServiceLocation) payload.serviceLocation = draftServiceLocation;
  const dobObj = dobPayloadFromInput(draftDob);
  if (draftDob && !dobObj) {
    return { payload: null, error: 'Date of birth must be a real date.' };
  }
  if (dobObj) payload.dob = dobObj;
  if (draftBusinessType) payload.businessType = draftBusinessType;
  if (showAbn && abn) payload.abn = abn;
  if (confirmedLock) payload.privateDetailsLock = true;
  return { payload, error: '' };
}
