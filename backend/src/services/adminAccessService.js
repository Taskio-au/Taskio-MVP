'use strict';

const { db } = require('../firebaseAdmin');

/**
 * Single source of truth for admin UI + soft warnings.
 * Authorization for destructive routes still uses token claims in middleware.
 *
 * @param {import('firebase-admin').auth.DecodedIdToken} tokenUser - req.user from verifyIdToken
 * @returns {Promise<{
 *   isAdmin: boolean,
 *   isSuperAdmin: boolean,
 *   role: 'admin'|'super_admin'|null,
 *   source: 'claims'|'firestore'|'combined',
 *   claimMismatchWarning: string|null,
 * }>}
 */
async function resolveAdminAccess(tokenUser) {
  const uid = tokenUser?.uid ? String(tokenUser.uid) : '';
  const claimAdmin = tokenUser?.admin === true;
  const claimSuper = tokenUser?.super_admin === true;
  const claimRole = tokenUser?.role ? String(tokenUser.role) : '';

  let fsRole = null;
  let fsAdmin = false;
  let fsSuper = false;
  try {
    if (uid) {
      const snap = await db.collection('users').doc(uid).get();
      if (snap.exists) {
        const d = snap.data() || {};
        fsRole = d.role ? String(d.role) : null;
        fsAdmin = d.admin === true || fsRole === 'admin';
        fsSuper = fsRole === 'super_admin';
      }
    }
  } catch (_) {
    // ignore
  }

  const isAdmin = claimAdmin || fsAdmin || claimRole === 'admin' || fsRole === 'admin';
  const isSuperFromClaims = claimSuper || claimRole === 'super_admin';
  const isSuperFromFs = fsSuper;
  const isSuperAdmin = isSuperFromClaims || isSuperFromFs;

  let source = 'claims';
  if (isSuperFromClaims && isSuperFromFs) source = 'combined';
  else if (!isSuperFromClaims && isSuperFromFs) source = 'firestore';
  else if (isSuperFromClaims && !isSuperFromFs && fsRole) source = 'combined';

  let claimMismatchWarning = null;
  if (isSuperFromFs && !isSuperFromClaims) {
    claimMismatchWarning =
      'Firestore role is super_admin but ID token does not include super_admin. Re-login or sync custom claims for full API access.';
  }

  let role = null;
  if (isSuperAdmin) role = 'super_admin';
  else if (isAdmin) role = 'admin';

  return {
    isAdmin: !!isAdmin,
    isSuperAdmin: !!isSuperAdmin,
    role,
    source,
    claimMismatchWarning,
  };
}

module.exports = { resolveAdminAccess };
