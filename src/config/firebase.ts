import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable Firebase Emulator in development
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  try {
    connectAuthEmulator(
      auth,
      import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL,
      { disableWarnings: true }
    );
    connectFirestoreEmulator(
      db,
      'localhost',
      parseInt(import.meta.env.VITE_FIREBASE_EMULATOR_HOST.split(':')[1])
    );
    console.log('Firebase Emulator connected');
  } catch (error) {
    console.log('Firebase Emulator already initialized or not available');
  }
}
