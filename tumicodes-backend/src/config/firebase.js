const admin = require('firebase-admin');
try {
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
  console.log('Firebase admin initialized');
} catch (err) {
  console.warn('Firebase admin init skipped (missing config)');
}
module.exports = admin;