import React from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuthUser } from "../lib/useAuthUser";
import { useUserProfile } from "../lib/useAuthUser";
import logo from "../assets/MainBeaverLogo.png";

export default function Navbar() {
  const user = useAuthUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const profile = useUserProfile(user?.uid);

  React.useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  async function handleSignOut() {
    try {
      await signOut(auth);
      navigate("/welcome");
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  }

  const isAdmin = Boolean(profile?.isAdmin ?? profile?.roles?.admin);

  const signedOutLinks = (
    <>
      <Link
        to="/support"
        className="transition hover:text-black"
      >
        Support
      </Link>
      <button
        onClick={() => navigate("/about")}
        className="transition hover:text-black"
      >
        About
      </button>
    </>
  );

  const signedInLinks = (
    <>
      <button
        onClick={() => navigate(`/u/${user?.uid ?? ""}`)}
        className="transition hover:text-black"
      >
            My Profile
      </button>
      {signedOutLinks}
    </>
  );

  const adminLink = isAdmin ? (
    <Link to="/admin" className="transition hover:text-black">
      Admin
    </Link>
  ) : null;

  return (
    <nav className="sticky top-0 z-50 border-b bg-white/90 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="rounded-full border border-transparent p-2 text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring sm:hidden"
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {menuOpen ? (
                <>
                  <path d="M6 18L18 6" />
                  <path d="M6 6l12 12" />
                </>
              ) : (
                <>
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h16" />
                </>
              )}
            </svg>
          </button>
          <Link to="/" className="flex items-center">
            <img
              src={logo}
              alt="HelpHub Local Logo"
              className="h-12 w-auto object-contain sm:h-16"
            />
          </Link>
        </div>

        <div className="hidden items-center gap-6 text-base font-medium text-gray-700 sm:flex">
          {user ? (
            <>
              {signedInLinks}
              {adminLink}
            </>
          ) : (
            signedOutLinks
          )}
        </div>

        <div className="hidden items-center gap-3 text-base sm:flex">
          {user ? (
            <button
              onClick={handleSignOut}
              className="rounded-full border border-gray-200 px-4 py-1.5 font-semibold text-gray-800 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Sign out
            </button>
          ) : (
            <Link
              to="/auth"
              className="rounded-full border border-gray-200 px-4 py-1.5 font-semibold text-gray-800 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Sign in
          </Link>
          )}
        </div>

        <div className="sm:hidden">
        {user ? (
          <button
            onClick={handleSignOut}
              className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-800 transition hover:border-gray-300 hover:bg-gray-50"
          >
            Sign out
          </button>
        ) : (
          <Link
            to="/auth"
              className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-800 transition hover:border-gray-300 hover:bg-gray-50"
          >
            Sign in
          </Link>
        )}
      </div>
      </div>

      {menuOpen && (
        <div className="sm:hidden">
          <div className="space-y-2 border-t border-gray-100 bg-white px-4 py-4 text-base font-medium text-gray-700 shadow-lg">
            {user ? (
              <>
                <button
                  onClick={() => navigate(`/u/${user.uid}`)}
                  className="block w-full text-left rounded-lg px-3 py-2 transition hover:bg-gray-50"
                >
                  My Profile
                </button>
                {isAdmin && (
                  <Link
                    to="/admin"
                    className="block rounded-lg px-3 py-2 transition hover:bg-gray-50"
                  >
                    Admin
                  </Link>
                )}
                <Link
                  to="/support"
                  className="block rounded-lg px-3 py-2 transition hover:bg-gray-50"
                >
                  Support
                </Link>
                <button
                  onClick={() => navigate("/about")}
                  className="block w-full text-left rounded-lg px-3 py-2 transition hover:bg-gray-50"
                >
                  About
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/support"
                  className="block rounded-lg px-3 py-2 transition hover:bg-gray-50"
                >
                  Support
                </Link>
                <button
                  onClick={() => navigate("/about")}
                  className="block w-full text-left rounded-lg px-3 py-2 transition hover:bg-gray-50"
                >
                  About
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
