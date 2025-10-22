import { Link } from "react-router-dom";
import { auth, googleProvider } from "../lib/firebase";
import { onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import React from "react";

export default function Navbar() {
  const [user, setUser] = React.useState<User | null | undefined>(undefined); // undefined = still loading

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  async function handleSignIn() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Sign-in failed:", err);
      alert("Could not sign in. Please try again.");
    }
  }

  async function handleSignOut() {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Sign-out failed:", err);
    }
  }

  return (
    <header className="border-b bg-white">
      <nav className="mx-auto flex max-w-5xl items-center justify-between p-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <img
            src="src/assets/HelpHub_Local_Logo.jpg"
            alt="HelpHub Logo"
            className="h-8 w-auto"
          />
          <span className="sr-only">HelpHub Local</span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* while loading, don't show anything */}
          {user === undefined ? null : user ? (
            <>
              <Link to="/profile" className="text-sm hover:underline">
                Profile
              </Link>
              <button
                onClick={handleSignOut}
                className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={handleSignIn}
              className="rounded-lg bg-black px-4 py-1.5 text-sm text-white hover:opacity-90"
            >
              Sign in
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
