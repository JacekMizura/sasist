import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { isSuperRole } from "@/auth/isSuperRole";
import { permissionGranted } from "@/auth/permissionEffective";
import { useAuth } from "@/context/AuthContext";
import { findWmsModuleByPathname } from "./wmsTabConfig";
import { WMS_ROUTES } from "./wmsRoutes";

/**
 * Route guard: direct URL entry respects the same operationalMode / requiredPermission
 * as dashboard/topbar. Empty modes list = all floor modes (+ Operacje hub) allowed.
 * Super roles always allowed.
 */
export function WmsOperationalModeGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (!user) return <>{children}</>;
  if (isSuperRole(user.role)) return <>{children}</>;

  const modes = user.wms_operational_modes ?? user.wms_profile?.wms_operational_modes ?? [];
  const permissions = user.permissions ?? [];

  if (pathname === "/wms" || pathname === "/wms/" || pathname.startsWith("/wms/menu")) {
    return <>{children}</>;
  }

  const mod = findWmsModuleByPathname(pathname);
  if (!mod) return <>{children}</>;

  if (mod.requiredPermission) {
    if (!modes.length) return <>{children}</>;
    if (permissionGranted(permissions, mod.requiredPermission)) return <>{children}</>;
    if (mod.requiredPermission === "warehouse.operations" && modes.includes("operations")) {
      return <>{children}</>;
    }
    return <Navigate to={WMS_ROUTES.menu} replace />;
  }

  if (!modes.length) return <>{children}</>;
  if (!mod.operationalMode) return <>{children}</>;
  if (modes.includes(mod.operationalMode)) return <>{children}</>;

  return <Navigate to={WMS_ROUTES.menu} replace />;
}
