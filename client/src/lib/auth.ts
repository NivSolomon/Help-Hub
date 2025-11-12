// src/lib/auth.ts
import {
  GoogleAuthProvider,
  signInWithPopup,
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { app } from "./firebase";

export const auth = getAuth(app);

// --------------------- Google ---------------------
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(auth, provider);
}

// --------------------- Email/Password ---------------------
export async function registerWithEmail(email: string, password: string) {
  if (!email || !password) throw new Error("Email & password required");
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (error: any) {
    if (error?.code === "auth/weak-password") {
      throw new Error("Password must be at least 6 characters");
    }
    if (error?.code === "auth/email-already-in-use") {
      throw new Error("That email is already registered. Try signing in instead.");
    }
    if (error?.code === "auth/invalid-email") {
      throw new Error("That email doesn’t look right. Double-check and try again.");
    }
    throw error;
  }
}

export async function signInWithEmail(email: string, password: string) {
  if (!email || !password) throw new Error("Email & password required");
  await signInWithEmailAndPassword(auth, email, password);
}

// --------------------- Phone (IL default) ---------------------
let confirmationResult: ConfirmationResult | null = null;

// Accepts: "054-9203398", "0549203398", "+972549203398"
function normalizeIL(raw: string): string | null {
  let s = raw.trim();
  // remove spaces/dashes/() but keep leading +
  s = s.replace(/[^\d+]/g, "");

  if (s.startsWith("+")) return s;          // already E.164
  if (/^0\d{8,9}$/.test(s)) return "+972" + s.slice(1); // local IL → E.164
  return null;
}

function ensureRecaptcha(): RecaptchaVerifier {
  // Reuse a singleton verifier bound to our container id
  const KEY = "__recaptchaVerifier";
  const w = window as any;
  if (!w[KEY]) {
    // IMPORTANT: argument order is (auth, containerId, options)
    w[KEY] = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible", // change to "normal" if you want to see the widget
    });
  }
  return w[KEY] as RecaptchaVerifier;
}

export async function sendPhoneCode(input: string): Promise<void> {
  const formatted = normalizeIL(input);
  if (!formatted) {
    throw new Error('Please enter a valid Israeli phone (e.g. 054-9203398 or "+972549203398").');
  }

  try {
    // Make sure the container is in the DOM
    if (!document.getElementById("recaptcha-container")) {
      throw new Error('Missing <div id="recaptcha-container" /> in the DOM');
    }

    const verifier = ensureRecaptcha();
    confirmationResult = await signInWithPhoneNumber(auth, formatted, verifier);
    console.log("SMS sent (or test number accepted) to", formatted);
  } catch (e: any) {
    // Give actionable messages
    const code: string | undefined = e?.code;
    if (code === "auth/operation-not-allowed") {
      throw new Error(
        "Phone sign-in is not fully enabled. Ensure the project allows phone auth, localhost is authorized, and a test number is configured."
      );
    } else if (code === "auth/too-many-requests") {
      throw new Error("Too many attempts. Please wait a minute and try again.");
    } else if (code === "auth/invalid-phone-number") {
      throw new Error("Invalid phone number format. Try +972549203398.");
    } else {
      console.error("sendPhoneCode error:", e);
      throw new Error("Failed to send SMS. Please check your setup or try again later.");
    }
  }
}

export async function confirmPhoneCode(code: string) {
  if (!confirmationResult) {
    throw new Error("No SMS verification in progress.");
  }
  try {
    const res = await confirmationResult.confirm(code);
    console.log("Signed in user:", res.user);
    confirmationResult = null;
  } catch (e) {
    console.error("confirmPhoneCode failed:", e);
    throw new Error("Invalid code. Please try again.");
  }
}
