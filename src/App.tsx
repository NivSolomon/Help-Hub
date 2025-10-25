import * as React from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import Home from "./pages/Home";
import Welcome from "./pages/Welcome";
import AuthPage from "./pages/Auth";
import ProfilePage from "./pages/Profile";
import { useAuthUser } from "./lib/useAuthUser";

// ✅ Protect private routes (requires login)
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthUser();
  const location = useLocation();

  // While loading auth state
  if (user === undefined) return null;

  // Not logged in → redirect to welcome
  if (!user)
    return <Navigate to="/welcome" replace state={{ from: location }} />;

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/auth" element={<AuthPage />} />

      {/* Public profile (anyone can view by UID) */}
      <Route path="/u/:uid" element={<ProfilePage />} />

      {/* Private routes */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Home />
          </PrivateRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
