import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";

export default function GoogleSignInButton() {
  return (
    <button
      onClick={() => signInWithPopup(auth, googleProvider)}
      className="w-full rounded-xl bg-black text-white py-3 font-medium hover:opacity-90"
    >
      Continue with Google
    </button>
  );
}
