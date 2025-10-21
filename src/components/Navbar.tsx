import { Link } from "react-router-dom";
import { auth } from "../lib/firebase";

export default function Navbar() {
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-5xl items-center justify-between p-4">
        <Link to="/" className="w-24">
          <img  src="src\assets\HelpHub_Local_Logo.jpg" alt="HelpHub Logo" />
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/profile" className="text-sm">
            Profile
          </Link>
          <button
            onClick={() => auth.signOut()}
            className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>
  );
}
