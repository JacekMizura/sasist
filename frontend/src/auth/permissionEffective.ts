/**
 * Must mirror backend `auth.deps.user_has_permission` expansion rules so UI gates match API.
 */
const ORDERS_VIEW_GRANULAR = new Set([
  "orders.list",
  "orders.detail",
  "orders.customer",
  "orders.history",
  "orders.documents",
]);

export function permissionGranted(granted: readonly string[], key: string): boolean {
  const g = new Set(granted);
  if (g.has(key)) return true;
  if (ORDERS_VIEW_GRANULAR.has(key) && g.has("orders.view")) return true;
  if (key === "orders.view") {
    for (const k of ORDERS_VIEW_GRANULAR) {
      if (g.has(k)) return true;
    }
  }
  if (key === "orders.cancel" && g.has("orders.delete")) return true;
  if (key === "orders.delete" && g.has("orders.cancel")) return true;
  return false;
}
