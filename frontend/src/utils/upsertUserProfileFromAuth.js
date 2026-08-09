import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
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

function devLogBootstrap(path, keys) {
  if (process.env.NODE_ENV !== 'development') return;
  // eslint-disable-next-line no-console
  console.info('[Taskio] upsertUserProfileFromAuth', { path, keys });
}

/**
 * Safely creates or patches `users/{uid}` from an authenticated Firebase user.
 *
 * - **Create** (no doc): writes bootstrap fields allowed by Firestore **create** rules.
 * - **Update** (doc exists): writes **only** fields allowed by **update** rules (see CLIENT_UPDATE_ALLOWED_KEYS).
 *   We do not send provider, uid, role, status, verified, email, or firstName/lastName on update —
 *   those are not in the allowed diff list (or role/verified are forbidden to change client-side).
 *
 * Legacy docs missing `role`: do not patch client-side; rules forbid changing `role` on update.
 * Fix via Admin SDK / backfill / support.
 */
export async function upsertUserProfileFromAuth(user, providerName, overrides = {}) {
  if (!user?.uid) throw new Error('Missing user uid');

  const uid = user.uid;
  const email = nonEmpty(user.email) || nonEmpty(overrides.email);
  const photoURL = nonEmpty(user.photoURL) || nonEmpty(overrides.photoURL);

  const fromDisplayName = splitDisplayName(user.displayName);
  const nameFromOverrides = nonEmpty(overrides.name);
  const name =
    nameFromOverrides ||
    nonEmpty(fromDisplayName.name) ||
    [nonEmpty(overrides.firstName), nonEmpty(overrides.lastName)].filter(Boolean).join(' ').trim();

  const firstName = nonEmpty(overrides.firstName) || nonEmpty(fromDisplayName.firstName);
  const lastName = nonEmpty(overrides.lastName) || nonEmpty(fromDisplayName.lastName);

  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() || {} : {};

  if (!snap.exists()) {
    const createPayload = {
      uid,
      provider: providerName,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    if (!existing.role) createPayload.role = 'homeowner';
    if (!existing.status) createPayload.status = 'active';
    if (typeof existing.verified !== 'boolean') createPayload.verified = false;

    if (email && !existing.email) createPayload.email = email;
    const safeName = validNameForRules(name);
    if (safeName && !existing.name) createPayload.name = safeName;
    if (firstName && !existing.firstName) createPayload.firstName = firstName;
    if (lastName && !existing.lastName) createPayload.lastName = lastName;
    if (photoURL && !existing.photoURL) createPayload.photoURL = photoURL;

    devLogBootstrap('create', Object.keys(createPayload));
    await setDoc(ref, createPayload);
    return createPayload;
  }

  /**
   * Existing document: only allowed update keys. Never role/verified/provider/email/uid/firstName/lastName/status.
   * If `role` is missing on a legacy doc, server-side backfill is required — client update is denied by rules.
   */
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
  return patch;
}
