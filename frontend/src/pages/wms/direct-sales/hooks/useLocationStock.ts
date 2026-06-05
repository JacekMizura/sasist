import { useCallback, useEffect, useState } from "react";

import { useOperationalLiveStream } from "../../../../hooks/useOperationalLiveStream";
import { fetchLocationStock, type LocationStockSnapshot } from "../services/locationStockApi";
import { DAMAGE_TENANT_ID } from "../../../../constants/panelTenant";

export function useLocationStock(warehouseId: number | null) {
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

  const { subscribe } = useOperationalLiveStream({
    tenantId: DAMAGE_TENANT_ID,
    warehouseId,
    enabled: warehouseId != null,
    eventTypes: ["stock.changed", "replenishment.alert"],
    useSse: true,
  });

  useEffect(() => {
    return subscribe((ev) => {
      const pid = ev.payload?.product_id;
      if (typeof pid !== "number" || lastProductId == null || pid !== lastProductId) return;
      void refreshStock(pid, typeof ev.revision === "string" ? ev.revision : stockSnap?.revision);
    });
  }, [subscribe, lastProductId, refreshStock, stockSnap?.revision]);

  return { stockSnap, lastProductId, refreshStock, clearStock };
}
