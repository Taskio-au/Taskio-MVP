'use strict';

const { admin, db } = require('../firebaseAdmin');
const { requireEnrolledProfile } = require('../utils/enrolledProfile');

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
  if (user && user.admin === true) return next();

  return res.status(403).send({ message: 'Forbidden: Requires admin privileges' });
}

/**
 * Destructive payment / dispute resolution. Allowed only for the Firebase
 * custom claim `super_admin`; profile documents are not an authority source.
 */
async function requireSuperAdmin(req, res, next) {
  const user = req.user;
  if (!user?.uid) {
    return res.status(403).send({ message: 'Forbidden: Requires super admin privileges' });
  }
  if (user.super_admin === true) return next();
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

module.exports = { requireAuth, requireAdmin, requireSuperAdmin, requireRole, requireEnrolledProfile };

