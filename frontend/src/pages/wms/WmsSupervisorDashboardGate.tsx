import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import WmsOperationalDashboardPage from "./WmsOperationalDashboardPage";
import { canAccessWmsSupervisorDashboard } from "./wmsSupervisorAccess";
import { WMS_ROUTES } from "./wmsRoutes";

/** Pulpit KPI — tylko kierownik; operatorzy wracają do Braki. */
export default function WmsSupervisorDashboardGate() {
  const { user, hasPermission } = useAuth();
  if (!canAccessWmsSupervisorDashboard(hasPermission, user?.role)) {
    return <Navigate to={WMS_ROUTES.braki()} replace />;
  }
  return <WmsOperationalDashboardPage />;
}
