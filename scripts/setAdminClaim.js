const admin = require('firebase-admin');
const path = require('path');

// To run this script:
// 1. Download your service account key from Firebase Console
// 2. Set the path to the key below or via environment variable
const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT || './serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const setAdmin = async (uid) => {
  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log(`Successfully set admin claim for user: ${uid}`);
    process.exit(0);
  } catch (error) {
    console.error('Error setting admin claim:', error);
    process.exit(1);
  }
};

const uid = process.argv[2];
if (!uid) {
  console.error('Please provide a user UID: node setAdminClaim.js <UID>');
  process.exit(1);
}

setAdmin(uid);
