import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuthUser } from "../lib/useAuthUser";
import logo from "../assets/HelpHub_Local_Logo.jpg"; // ✅ proper import path

export default function Navbar() {
  const user = useAuthUser();
  const navigate = useNavigate();

  async function handleSignOut() {
    try {
      await signOut(auth);
      navigate("/welcome");
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  }

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between border-b bg-white/90 px-4 py-2 shadow-sm backdrop-blur-md">
      {/* ✅ Logo only (centered vertically and properly scaled) */}
      <Link to="/" className="flex items-center">
        <img
          src={logo}
          alt="HelpHub Local Logo"
          className="h-10 w-auto object-contain" // ✅ adjust height to fit navbar
        />
      </Link>

      {/* Right side: auth actions */}
      {user ? (
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/u/${user.uid}`)}
            className="text-sm font-medium text-gray-700 hover:text-black"
          >
            My Profile
          </button>
          <button
            onClick={handleSignOut}
            className="rounded-md bg-black px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            Sign out
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Sign in
          </Link>
          <Link
            to="/welcome"
            className="text-sm text-gray-700 hover:text-black"
          >
            About
          </Link>
        </div>
      )}
    </nav>
  );
}
