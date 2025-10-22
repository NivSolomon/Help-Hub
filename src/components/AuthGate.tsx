// src/components/AuthGate.tsx
import { ReactNode, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { ensureUserDoc, useUserProfile } from "../lib/users";
import BirthdatePrompt from "./BirthdatePrompt";

// Simple spinner
function ScreenSpinner() {
  return (
    <div className="grid h-[calc(100dvh-64px)] place-items-center">
      <div className="animate-spin h-8 w-8 rounded-full border-2 border-black border-t-transparent" />
    </div>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(!!auth.currentUser);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const profile = useUserProfile(uid);

  // hydrate auth on refresh
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUid(u?.uid ?? null);
      setHydrated(true);
      if (u) {
        // seed user doc (idempotent)
        await ensureUserDoc(u.uid, {
          displayName: u.displayName ?? u.providerData[0]?.displayName ?? null,
          photoURL: u.photoURL ?? null,
          email: u.email ?? null,
          // If you extract birthday from Google People API, feed it here as seed.birthdateISO
        });
      }
    });
    return () => unsub();
  }, []);

  const needsBirthdate = useMemo(() => {
    if (!uid) return false; // not signed in -> gate elsewhere
    if (!profile) return false; // still loading profile
    return !profile.birthdateISO; // show prompt exactly when missing
  }, [uid, profile]);

  if (!hydrated) return <ScreenSpinner />;

  if (!uid) {
    // Not signed in: render nothing, or your login layout
    return (
      <div className="grid h-[calc(100dvh-64px)] place-items-center text-gray-600">
        Sign in required.
      </div>
    );
  }

  return (
    <>
      {/* Block the app if birth date isn't set yet */}
      {needsBirthdate && (
        <BirthdatePrompt
          uid={uid}
          // onSaved={() => { /* profile listener will hide the modal automatically */ }}
          suggestedISO={profile?.birthdateISO ?? undefined}
        />
      )}
      {/* App content always renders; the prompt visually blocks interaction until saved */}
      <div aria-hidden={needsBirthdate ? "true" : "false"}>{children}</div>
    </>
  );
}
