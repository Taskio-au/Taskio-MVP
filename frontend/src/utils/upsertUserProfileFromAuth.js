import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Keys the Firestore rules allow clients to change on users/{uid} **update**
 * (see firestore.rules — hasOnly([...]) on diff.changedKeys()).
 * Do not add fields here unless rules explicitly allow them.
 */
const CLIENT_UPDATE_ALLOWED_KEYS = new Set([
  'name',
  'displayName',
  'phone',
  'phoneNumber',
  'phoneNumberE164',
  'phoneVerified',
  'photoURL',
  'photoPath',
  'profilePhotoURL',
  'profilePhotoPath',
  'businessName',
  'bio',
  'abn',
  'abnVerified',
  'updatedAt',
]);

const RECOGNISED_ROLES = new Set(['homeowner', 'tradie', 'admin']);
const RECOGNISED_STATUSES = new Set(['active', 'disabled', 'pending_deletion', 'deleted']);

export const ENROLMENT_ERROR_CODES = {
  NOT_ENROLLED: 'account_not_enrolled',
  STATE_INVALID: 'account_state_invalid',
};

function splitDisplayName(displayName) {
  const raw = String(displayName || '').trim();
  if (!raw) return { firstName: '', lastName: '', name: '' };
  const parts = raw.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
  return { firstName, lastName, name: raw };
}

function nonEmpty(v) {
  const s = typeof v === 'string' ? v.trim() : v;
  return s ? s : '';
}

/** Rules require name length 2–80 when the field is set. */
function validNameForRules(name) {
  const s = String(name || '').trim();
  return s.length >= 2 && s.length <= 80 ? s : '';
}

function classifyClientProfile(snap) {
  if (!snap || typeof snap.exists !== 'function' || snap.exists() !== true) {
    return { kind: 'missing', data: null };
  }
  const data = snap.data() || {};
  const role = String(data.role || '').trim();
  const status = String(data.status || '').trim();
  if (!role || !status || !RECOGNISED_ROLES.has(role) || !RECOGNISED_STATUSES.has(status)) {
    return { kind: 'invalid', data };
  }
  return { kind: 'valid', data };
}

function enrolmentResult(code) {
  return { enrolled: false, code };
}

function devLogBootstrap(path, keys) {
  if (process.env.NODE_ENV !== 'development') return;
  // eslint-disable-next-line no-console
  console.info('[Taskio] upsertUserProfileFromAuth', { path, keys });
}

/**
 * Update-only patch of `users/{uid}` from an authenticated Firebase user.
 *
 * Missing or structurally invalid profiles are not created or repaired here.
 * Enrolment is backend-only. Permission-denied, network, and timeout errors
 * are rethrown and must not be translated into enrolment codes.
 */
export async function upsertUserProfileFromAuth(user, providerName, overrides = {}) {
  if (!user?.uid) throw new Error('Missing user uid');

  const uid = user.uid;
  const photoURL = nonEmpty(user.photoURL) || nonEmpty(overrides.photoURL);

  const fromDisplayName = splitDisplayName(user.displayName);
  const nameFromOverrides = nonEmpty(overrides.name);
  const name =
    nameFromOverrides ||
    nonEmpty(fromDisplayName.name) ||
    [nonEmpty(overrides.firstName), nonEmpty(overrides.lastName)].filter(Boolean).join(' ').trim();

  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const classified = classifyClientProfile(snap);

  if (classified.kind === 'missing') {
    return enrolmentResult(ENROLMENT_ERROR_CODES.NOT_ENROLLED);
  }
  if (classified.kind === 'invalid') {
    return enrolmentResult(ENROLMENT_ERROR_CODES.STATE_INVALID);
  }

  const existing = classified.data || {};
  const patch = {
    updatedAt: serverTimestamp(),
  };

  const safeName = validNameForRules(name);
  if (safeName && !nonEmpty(existing.name)) patch.name = safeName;
  if (photoURL && !nonEmpty(existing.photoURL)) patch.photoURL = photoURL;

  devLogBootstrap(
    'update',
    Object.keys(patch).filter((k) => CLIENT_UPDATE_ALLOWED_KEYS.has(k))
  );

  await updateDoc(ref, patch);
  return { enrolled: true, patch };
}
