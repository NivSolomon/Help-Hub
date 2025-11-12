import { useEffect, useState } from "react";

import { apiFetch } from "./api";
import { auth } from "./firebase";

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
  bio?: string | null;

  // age
  birthdateISO?: string | null; // "YYYY-MM-DD"
  birthdateSetAt?: any; // Firestore Timestamp

  // audit
  createdAt?: any;
  updatedAt?: any;

  // roles
  roles?: {
    admin?: boolean;
  };
  isAdmin?: boolean;
};

export type UserProfileResponse = UserProfile & { id: string };

// make sure a doc exists
export async function ensureUserDoc(
  uid: string,
  seed: Partial<UserProfile> = {}
): Promise<UserProfile> {
  const data = await apiFetch<UserProfileResponse>("/users/ensure", {
    method: "POST",
    body: JSON.stringify(seed ?? {}),
  });
  return data;
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
    bio?: string;
  }
) {
  await apiFetch("/users/me/onboarding", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateUserProfile(
  data: Partial<Pick<UserProfile, "firstName" | "lastName" | "displayName" | "phone" | "address" | "bio" | "birthdateISO">>
) {
  await apiFetch("/users/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// (kept for backwards compat in other places if you still call it)
export async function saveBirthdate(uid: string, iso: string) {
  await apiFetch("/users/me", {
    method: "PATCH",
    body: JSON.stringify({
      birthdateISO: iso,
    }),
  });
}

export function useUserProfile(uid?: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      return;
    }

    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchProfile = async () => {
      if (stop) return;
      try {
        const currentUid = auth.currentUser?.uid;
        const endpoint = currentUid === uid ? "/users/me" : `/users/${uid}`;
        const data = await apiFetch<UserProfileResponse>(endpoint);
        if (!stop) {
          setProfile(data);
        }
      } catch (error) {
        console.error("[users] failed to fetch profile", error);
        if (!stop) {
          setProfile(null);
        }
      } finally {
        if (!stop) {
          timer = setTimeout(fetchProfile, 10000);
        }
      }
    };

    void fetchProfile();

    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [uid]);

  return profile;
}

export async function fetchUserProfile(userId: string) {
  return apiFetch<UserProfileResponse>(`/users/${userId}`);
}
