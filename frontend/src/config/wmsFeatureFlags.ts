/** WMS v2 operational queues (product-centric) — enable via env or localStorage. */
export function useOperationalQueues(): boolean {
  if (import.meta.env.VITE_WMS_OPERATIONAL_QUEUES === "1") return true;
  try {
    return localStorage.getItem("wms.useOperationalQueues") === "1";
  } catch {
    return false;
  }
}
