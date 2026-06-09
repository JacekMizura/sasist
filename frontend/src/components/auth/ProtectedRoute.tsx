import { Navigate, Outlet, useLocation } from "react-router-dom";

import AuthBootstrapScreen from "@/components/auth/AuthBootstrapScreen";
import LastPathTracker from "@/components/auth/LastPathTracker";
import { useAuth } from "@/context/AuthContext";

/** Redirects unauthenticated users to `/login`; tracks last path for return after login. */
export default function ProtectedRoute() {
  const { loading, sessionReady } = useAuth();
  const location = useLocation();

  if (loading) return <AuthBootstrapScreen />;

  if (!sessionReady) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <>
      <LastPathTracker />
      <Outlet />
    </>
  );
}
