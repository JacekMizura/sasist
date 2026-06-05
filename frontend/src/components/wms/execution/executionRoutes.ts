/** Routes where warehouse execution UX (fullscreen, sticky context) applies. */
const EXECUTION_ROUTE_RE =
  /^\/wms\/(operational-queues\/(relocation|task)\/\d+|receiving\/pz\/\d+|receiving\/\d+|putaway\/\d+\/item\/\d+(\/execute)?|putaway\/\d+|picking\/(products\/\d+|recovery\/\d+))(\/|$)/;

const BRAKI_HUB_RE = /^\/wms\/(braki|issues)(\/|$)/;

export function isWarehouseExecutionRoute(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/wms/operational-queues" || p === "/wms/operational-queues/dashboard") return false;
  if (BRAKI_HUB_RE.test(p)) return true;
  return EXECUTION_ROUTE_RE.test(p);
}

export function isOperationalExecutionHub(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/wms/braki" || p === "/wms/issues";
}
