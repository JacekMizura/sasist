import { isSuperRole } from "@/auth/isSuperRole";

/** Supervisor / manager — conflict resolution and inventory approval UI. */
export function canResolveInventoryCountConflict(
  hasPermission: (key: string) => boolean,
  role?: string | null,
): boolean {
  if (isSuperRole(role)) return true;
  if (hasPermission("inventory.approve")) return true;
  if (hasPermission("inventory.recount")) return true;
  if (hasPermission("wms.supervisor")) return true;
  const r = (role ?? "").trim().toLowerCase();
  return r === "warehouse_manager";
}
