import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { isSuperRole } from "@/auth/isSuperRole";
import { useAuth } from "@/context/AuthContext";
import { findWmsModuleByPathname } from "./wmsTabConfig";
import { WMS_ROUTES } from "./wmsRoutes";

/**
 * Route guard: direct URL entry respects the same operationalMode as dashboard/topbar.
 * Empty modes list = all allowed (admin default). Super roles always allowed.
 */
export function WmsOperationalModeGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (!user) return <>{children}</>;
  if (isSuperRole(user.role)) return <>{children}</>;

  const modes = user.wms_operational_modes ?? user.wms_profile?.wms_operational_modes ?? [];
  if (!modes.length) return <>{children}</>;

  if (pathname === "/wms" || pathname === "/wms/" || pathname.startsWith("/wms/menu")) {
    return <>{children}</>;
  }

  const mod = findWmsModuleByPathname(pathname);
  if (!mod?.operationalMode) return <>{children}</>;
  if (modes.includes(mod.operationalMode)) return <>{children}</>;

  return <Navigate to={WMS_ROUTES.menu} replace />;
}
