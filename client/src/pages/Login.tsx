import GoogleSignInButton from "../components/GoogleSignInButton";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => u && nav("/"));
    return () => unsub();
  }, [nav]);

  return (
    <div className="grid h-[calc(100dvh-64px)] place-items-center">
      <div className="w-full max-w-sm rounded-2xl border p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-semibold">Welcome 👋</h1>
        <p className="mb-6 text-gray-600">
          Sign in to request help or offer help in your neighborhood.
        </p>
        <GoogleSignInButton />
      </div>
    </div>
  );
}
