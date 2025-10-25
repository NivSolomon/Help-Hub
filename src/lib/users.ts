import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { useEffect, useState } from "react";

export type UserProfile = {
  // basic identity
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null; // may mirror "FirstName LastName"
  photoURL?: string | null;
  email?: string | null;

  // contact
  phone?: string | null;
  address?: string | null;

  // age
  birthdateISO?: string | null; // "YYYY-MM-DD"
  birthdateSetAt?: any; // Firestore Timestamp

  // audit
  createdAt?: any;
  updatedAt?: any;
};

export function userDocRef(uid: string) {
  return doc(db, "users", uid);
}

// make sure a doc exists
export async function ensureUserDoc(
  uid: string,
  seed: Partial<UserProfile> = {}
): Promise<UserProfile> {
  const ref = userDocRef(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const body: UserProfile = {
      firstName: seed.firstName ?? null,
      lastName: seed.lastName ?? null,
      displayName:
        seed.displayName ??
        [seed.firstName, seed.lastName].filter(Boolean).join(" ") ??
        null,
      photoURL: seed.photoURL ?? null,
      email: seed.email ?? null,
      phone: seed.phone ?? null,
      address: seed.address ?? null,
      birthdateISO: seed.birthdateISO ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, body, { merge: true });
    return body;
  }
  return snap.data() as UserProfile;
}

// NEW: save onboarding data (first run)
export async function saveOnboardingProfile(
  uid: string,
  data: {
    firstName: string;
    lastName: string;
    birthdateISO: string;
    phone: string;
    address: string;
  }
) {
  const ref = userDocRef(uid);

  // simple "full display name"
  const displayName = `${data.firstName} ${data.lastName}`.trim();

  await updateDoc(ref, {
    firstName: data.firstName,
    lastName: data.lastName,
    displayName,
    birthdateISO: data.birthdateISO,
    birthdateSetAt: serverTimestamp(),
    phone: data.phone,
    address: data.address,
    updatedAt: serverTimestamp(),
  });
}

// (kept for backwards compat in other places if you still call it)
export async function saveBirthdate(uid: string, iso: string) {
  const ref = userDocRef(uid);
  await updateDoc(ref, {
    birthdateISO: iso,
    birthdateSetAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function useUserProfile(uid?: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      return;
    }
    const ref = userDocRef(uid);

    const unsub = onSnapshot(ref, (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
    });

    return () => unsub();
  }, [uid]);

  return profile;
}
