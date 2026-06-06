import { useCallback, useEffect, useState } from "react";

import type { LiveEvent } from "../../api/operationalRuntimeApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import {
  fetchLocationStock,
  type LocationStockSnapshot,
} from "../../api/locationStockApi";

type SubscribeFn = (handler: (ev: LiveEvent) => void) => () => void;

export function useLocationStock(warehouseId: number | null, subscribe?: SubscribeFn) {
  const [stockSnap, setStockSnap] = useState<LocationStockSnapshot | null>(null);
  const [lastProductId, setLastProductId] = useState<number | null>(null);

  const refreshStock = useCallback(
    async (productId: number, revision?: string | null) => {
      if (warehouseId == null) return;
      setLastProductId(productId);
      try {
        const snap = await fetchLocationStock({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId,
          productId,
          availableOnly: true,
          revision,
        });
        setStockSnap(snap);
      } catch {
        setStockSnap(null);
      }
    },
    [warehouseId],
  );

  const clearStock = useCallback(() => {
    setStockSnap(null);
    setLastProductId(null);
  }, []);

  useEffect(() => {
    if (!subscribe) return;
    return subscribe((ev) => {
      if (ev.event_type !== "stock.changed" && ev.event_type !== "replenishment.alert") return;
      const pid = ev.payload?.product_id;
      if (typeof pid !== "number" || lastProductId == null || pid !== lastProductId) return;
      void refreshStock(pid, typeof ev.revision === "string" ? ev.revision : stockSnap?.revision);
    });
  }, [subscribe, lastProductId, refreshStock, stockSnap?.revision]);

  return { stockSnap, lastProductId, refreshStock, clearStock };
}
