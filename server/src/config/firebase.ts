import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { env } from './env';

const hasServiceAccount =
  Boolean(env.FIREBASE_PROJECT_ID) &&
  Boolean(env.FIREBASE_CLIENT_EMAIL) &&
  Boolean(env.FIREBASE_PRIVATE_KEY);

const app = (() => {
  if (getApps().length) {
    return getApps()[0]!;
  }

  if (hasServiceAccount) {
    console.info('[firebase] using service account credentials');
    return initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY
      })
    });
  }

  console.warn('[firebase] falling back to application default credentials');
  return initializeApp({
    credential: applicationDefault()
  });
})();

export const firebaseAuth = getAuth(app);
export const firestore = getFirestore(app);

