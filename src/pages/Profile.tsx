import AuthGate from "../components/AuthGate";
import { auth } from "../lib/firebase";

export default function Profile() {
  const u = auth.currentUser;

  return (
    <AuthGate>
      <div className="mx-auto max-w-5xl p-4">
        <h2 className="mb-4 text-xl font-semibold">Your profile</h2>
        <div className="rounded-xl border p-6">
          <div className="flex items-center gap-4">
            {u?.photoURL && <img className="h-16 w-16 rounded-full" src={u.photoURL} />}
            <div>
              <div className="font-medium">{u?.displayName}</div>
              <div className="text-gray-600 text-sm">{u?.email}</div>
            </div>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
