'use strict';

const { admin, db } = require('../firebaseAdmin');

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

function requireAdmin(req, res, next) {
  const user = req.user;
  if (user && user.admin === true) return next();
  return res.status(403).send({ message: 'Forbidden: Requires admin privileges' });
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
      } catch (e) {
        // ignore and fall through to 403
      }
    }

    return res.status(403).send({ message: `Forbidden: Requires role ${role}` });
  };
}

module.exports = { requireAuth, requireAdmin, requireRole };


