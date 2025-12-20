'use strict';

const admin = require('firebase-admin');
require('dotenv').config();

/* -------------------------------------------------------------------------- */
/* Firebase Admin Init                                                        */
/* -------------------------------------------------------------------------- */
if (!admin.apps.length) {
  const path = require('path');

  // 1) Preferred: explicit file
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (serviceAccountPath) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const serviceAccount = require(path.resolve(serviceAccountPath));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id,
    });
  } else {
    // Fallback (can easily point to the wrong project locally)
    admin.initializeApp();
  }
}

const db = admin.firestore();

module.exports = { admin, db };


