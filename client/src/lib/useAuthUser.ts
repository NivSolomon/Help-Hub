// src/lib/useAuthUser.ts
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";

import { auth, db } from "./firebase";
import type { UserProfile } from "./users";

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}

export function useUserProfile(uid?: string | null) {
  const [profile, setProfile] = useState<UserProfile | null | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      return;
    }

    const ref = doc(db, "users", uid);
    return onSnapshot(ref, (s) =>
      setProfile(s.exists() ? (s.data() as UserProfile) : null),
    );
  }, [uid]);

  return profile;
}
