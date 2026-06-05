import { isSuperRole } from "../../auth/isSuperRole";

/** Supervisor-only WMS panels (dashboard / KPI) — not part of operator scan flow. */
export function canAccessWmsSupervisorDashboard(
  hasPermission: (key: string) => boolean,
  role?: string | null,
): boolean {
  if (isSuperRole(role)) return true;
  if (hasPermission("analytics.warehouse_operations")) return true;
  if (hasPermission("wms.supervisor")) return true;
  return import.meta.env.VITE_WMS_SUPERVISOR_DASHBOARD === "true";
}
