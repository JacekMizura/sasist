import { useCallback, useEffect, useState } from "react";

import { inventoryCountSyncQueue } from "./inventoryCountSyncQueue";

export function useInventoryCountOfflineStatus() {
  const [pendingOps, setPendingOps] = useState(0);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  const refresh = useCallback(() => {
    setPendingOps(inventoryCountSyncQueue.size());
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    refresh();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh]);

  return { online, pendingOps, refresh, enqueue: inventoryCountSyncQueue.enqueue };
}
