// src/components/GoogleSignInButton.tsx
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { ensureUserDoc, saveBirthdate } from "../lib/users";
import googleLogo from "../assets/Logo-google-icon-PNG.png";

async function fetchBirthdayFromGoogle(accessToken: string): Promise<string | null> {
  // People API "me?personFields=birthdays" returns full birthdays
  const res = await fetch("https://people.googleapis.com/v1/people/me?personFields=birthdays", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const b = (data.birthdays || []).find((x: any) => x.date && (x.metadata?.source?.type === "ACCOUNT" || x.metadata?.primary));
  if (!b?.date?.year || !b?.date?.month || !b?.date?.day) return null;
  const y = String(b.date.year).padStart(4, "0");
  const m = String(b.date.month).padStart(2, "0");
  const d = String(b.date.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function GoogleSignInButton() {
  async function handleClick() {
    const result = await signInWithPopup(auth, googleProvider);
    const u = result.user;

    // Ensure we have a user doc
    await ensureUserDoc(u.uid, {
      email: u.email,
      displayName: u.displayName ?? null,
      photoURL: u.photoURL ?? null,
    });

    // If we got an access token, try auto-fill birthday
    const cred = GoogleAuthProvider.credentialFromResult(result);
    const token = (cred as any)?.accessToken as string | undefined;

    if (token) {
      const iso = await fetchBirthdayFromGoogle(token).catch(() => null);
      if (iso) await saveBirthdate(u.uid, iso);
    }
  }

  return (
    <button
      onClick={handleClick}
      className="w-full rounded-xl bg-black text-white py-3 font-medium hover:opacity-90"
    >
      <span className="flex items-center justify-center gap-3">
        <img
          src={googleLogo}
          alt=""
          className="h-5 w-5 rounded-full bg-white object-cover"
          loading="lazy"
          aria-hidden
        />
        Continue with Google
      </span>
    </button>
  );
}
