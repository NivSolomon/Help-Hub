// src/lib/users.ts
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { useEffect, useState } from "react";

export type UserProfile = {
  birthdateISO?: string | null;     // "YYYY-MM-DD"
  birthdateSetAt?: any;             // Firestore Timestamp
  displayName?: string | null;
  photoURL?: string | null;
  email?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

export function userDocRef(uid: string) {
  return doc(db, "users", uid);
}

// Ensure a user doc exists (idempotent)
export async function ensureUserDoc(
  uid: string,
  seed: Partial<UserProfile> = {}
): Promise<UserProfile> {
  const ref = userDocRef(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const body: UserProfile = {
      displayName: seed.displayName ?? null,
      photoURL: seed.photoURL ?? null,
      email: seed.email ?? null,
      birthdateISO: seed.birthdateISO ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, body, { merge: true });
    return body;
  }
  return snap.data() as UserProfile;
}

// src/lib/users.ts
export async function saveBirthdate(uid: string, iso: string) {
  // tiny guard to keep data clean
  const norm = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? iso
    : (() => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const yyyy = String(d.getFullYear());
        return `${yyyy}-${mm}-${dd}`;
      })();

  if (!norm) throw new Error("Invalid date");

  const ref = userDocRef(uid);
  await updateDoc(ref, {
    birthdateISO: norm,
    birthdateSetAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}


export function useUserProfile(uid?: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  useEffect(() => {
    if (!uid) { setProfile(null); return; }
    const ref = userDocRef(uid);
    let cancelled = false;
    import("firebase/firestore").then(({ onSnapshot }) => {
      const unsub = onSnapshot(ref, (snap) => {
        if (cancelled) return;
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      });
      return () => unsub();
    });
    return () => { cancelled = true; };
  }, [uid]);
  return profile;
}
