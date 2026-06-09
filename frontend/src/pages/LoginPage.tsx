import { Navigate, useLocation, useNavigate } from "react-router-dom";

import LoginBrandingPanel from "@/components/auth/login/LoginBrandingPanel";
import LoginFormPanel from "@/components/auth/login/LoginFormPanel";
import AuthBootstrapScreen from "@/components/auth/AuthBootstrapScreen";
import { resolvePostLoginPath } from "@/auth/authSessionPrefs";
import { useAuth } from "@/context/AuthContext";

type LocationState = {
  from?: { pathname?: string; search?: string; hash?: string };
};

function redirectTarget(state: LocationState | null): string {
  const from = state?.from;
  if (from?.pathname && from.pathname !== "/login") {
    return `${from.pathname}${from.search ?? ""}${from.hash ?? ""}`;
  }
  return resolvePostLoginPath();
}

/** Modern SaaS login — dark branding + light form. */
export default function LoginPage() {
  const { loading, sessionReady } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const redirectTo = redirectTarget(location.state as LocationState | null);

  const onLoginSuccess = () => {
    navigate(redirectTo, { replace: true });
  };

  if (loading) return <AuthBootstrapScreen />;

  if (sessionReady) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-900">
      <LoginBrandingPanel />
      <LoginFormPanel onSuccess={onLoginSuccess} />
    </div>
  );
}
