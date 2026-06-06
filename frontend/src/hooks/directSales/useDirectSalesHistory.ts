import { useCallback, useEffect, useState } from "react";

import { fetchDirectSaleHistory } from "../../api/directSalesApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import type { DirectSaleHistoryEntry } from "../../types/directSalesCompletion";

type Args = {
  warehouseId: number | null;
  enabled?: boolean;
  refreshKey?: number;
};

export function useDirectSalesHistory({ warehouseId, enabled = true, refreshKey = 0 }: Args) {
  const [rows, setRows] = useState<DirectSaleHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [todayOnly, setTodayOnly] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled || warehouseId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchDirectSaleHistory({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
        todayOnly,
      });
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, warehouseId, todayOnly]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  return {
    rows,
    loading,
    todayOnly,
    toggleToday: () => setTodayOnly((v) => !v),
    refresh,
  };
}
