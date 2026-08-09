'use strict';

const { admin, db } = require('../firebaseAdmin');

function ensureUserProfile({ defaultRole } = {}) {
  return async (req, res, next) => {
    const uid = req.user?.uid;
    if (!uid) return next();

    try {
      const userRef = db.collection('users').doc(uid);
      const snap = await userRef.get();
      if (snap.exists) return next();

      const roleFromToken = req.user?.role;
      const role = roleFromToken || defaultRole;

      // Only create a profile doc when we can confidently assign a role.
      // For job posting we pass defaultRole='homeowner'; for other routes we may omit it.
      if (!role) return next();

      await userRef.set(
        {
          email: req.user?.email || '',
          firstName: '',
          lastName: '',
          role,
          status: 'active',
          verified: false,
          quoteAccessVerified: role === 'homeowner' && (!!req.user?.email || req.user?.email_verified === true),
          accountCompleted: false,
          ...(req.user?.phone_number ? { phone: req.user.phone_number, phoneVerified: true } : {}),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('ensureUserProfile failed:', e);
      // Don’t block the request on profile auto-heal.
    }

    return next();
  };
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    return res.status(401).send({ message: 'Unauthorized: No token provided' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    return next();
  } catch (error) {
    return res.status(401).send({ message: 'Unauthorized: Invalid token' });
  }
}

async function requireAdmin(req, res, next) {
  const user = req.user;
  if (user && user.admin === true) return next(); // existing mechanism: custom claim

  // Fallback: enforce admin from Firestore user doc (privacy-by-design: server-side only)
  if (user?.uid) {
    try {
      const adminDoc = await db.collection('users').doc(user.uid).get();
      const adminData = adminDoc.exists ? adminDoc.data() : null;
      if (adminData?.admin === true || adminData?.role === 'admin') {
        return next();
      }
    } catch (e) {
      // ignore and fall through
    }
  }

  return res.status(403).send({ message: 'Forbidden: Requires admin privileges' });
}

/**
 * Destructive payment / dispute resolution. Allowed for Firebase claim `super_admin`
 * or Firestore users/{uid}.role === 'super_admin'.
 */
async function requireSuperAdmin(req, res, next) {
  const user = req.user;
  if (!user?.uid) {
    return res.status(403).send({ message: 'Forbidden: Requires super admin privileges' });
  }
  if (user.super_admin === true) return next();
  try {
    const adminDoc = await db.collection('users').doc(user.uid).get();
    const role = adminDoc.exists ? adminDoc.data()?.role : null;
    if (role === 'super_admin') return next();
  } catch (e) {
    // fall through
  }
  return res.status(403).send({ message: 'Forbidden: Requires super admin privileges' });
}

function requireRole(role) {
  return async (req, res, next) => {
    const userRole = req.user?.role;
    if (userRole === role) return next();

    // Backward-compatible fallback: if older tokens don't include role claim, read from Firestore once.
    // This avoids breaking existing users while still enforcing role-based access.
    if (!userRole && req.user?.uid) {
      try {
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        const docRole = userDoc.exists ? userDoc.data()?.role : undefined;
        if (docRole === role) return next();

        if (!userDoc.exists) {
          return res.status(403).send({
            message: `Forbidden: Requires role ${role}. Your account is missing a user profile record. Please sign up via the app registration flow.`,
          });
        }
        if (docRole && docRole !== role) {
          return res.status(403).send({
            message: `Forbidden: Requires role ${role}. Your role is '${docRole}'.`,
          });
        }
      } catch (e) {
        // ignore and fall through to 403
      }
    }

    return res.status(403).send({
      message: `Forbidden: Requires role ${role}. Please re-login, or ensure your account was created via /api/users/register.`,
    });
  };
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin, requireRole, ensureUserProfile };


