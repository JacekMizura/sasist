/**
 * Deep execution screens (scan/product flow) — dark mode strip + operational context bar.
 * Hub/list pages and packing use WmsTopBar (minimal, scanner-first).
 */
const EXECUTION_ROUTE_RE =
  /^\/wms\/(operational-queues\/(relocation|task)\/\d+|receiving\/pz\/\d+|receiving\/\d+|putaway\/\d+\/item\/\d+(\/execute)?|putaway\/\d+|picking\/(products\/\d+|recovery\/batch\/\d+|recovery\/\d+))(\/|$)/;

/** Packing stays on WmsTopBar — never show WmsExecutionModeStrip / ExecutionGlobalContextBar. */
export function isPackingRoute(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/wms/packing" || p.startsWith("/wms/packing/");
}

export function isWarehouseExecutionRoute(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/wms/operational-queues" || p === "/wms/operational-queues/dashboard") return false;
  if (isPackingRoute(p)) return false;
  return EXECUTION_ROUTE_RE.test(p);
}

export function isOperationalExecutionHub(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/wms/braki" || p === "/wms/issues";
}
