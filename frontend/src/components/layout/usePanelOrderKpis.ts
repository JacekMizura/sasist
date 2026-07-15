import { useCallback, useEffect, useMemo, useState } from "react";

import { getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import { getTenantWmsPanelCounters } from "../../api/wmsDashboardApi";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../pages/damage/damageShared";
import { ORDERS_OPERATIONS_UPDATED_EVENT } from "../../pages/wms/wmsRoutes";
import { subscribeWmsShortagesUpdated } from "../../utils/wmsRefresh";
import type { OrderUiStatusPanelSummary } from "../../types/orderUiStatus";

function aggregateOrderBuckets(summary: OrderUiStatusPanelSummary | null): { nowe: number; wRealizacji: number } {
  if (!summary) return { nowe: 0, wRealizacji: 0 };
  let nowe = Number(summary.unassigned_count) || 0;
  let wRealizacji = 0;
  for (const g of summary.groups) {
    if (g.main_group === "NEW") nowe += Number(g.total_count) || 0;
    if (g.main_group === "IN_PROGRESS") wRealizacji += Number(g.total_count) || 0;
  }
  return { nowe, wRealizacji };
}

type UsePanelOrderKpisOpts = {
  /** Gdy false — brak zapytań (np. ścieżki WMS w szkielecie ERP). */
  enabled?: boolean;
};

/** Dane do paska KPI w szkielecie ERP (nie używać w layoucie WMS). Tenant-wide — niezależne od aktywnego magazynu WMS. */
export function usePanelOrderKpis(opts?: UsePanelOrderKpisOpts) {
  const enabled = opts?.enabled !== false;
  const { user } = useAuth();
  const { showWarehouseSelector } = useWarehouse();

  const [panelSummary, setPanelSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [ordersDelayed, setOrdersDelayed] = useState(0);
  const [packingBraki, setPackingBraki] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setPanelSummary(null);
      setOrdersDelayed(0);
      setPackingBraki(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [summary, wmsCounters] = await Promise.all([
        getOrderUiStatusSummary(DAMAGE_TENANT_ID).catch(() => null),
        getTenantWmsPanelCounters(DAMAGE_TENANT_ID).catch(() => null),
      ]);
      setPanelSummary(summary);
      setOrdersDelayed(wmsCounters != null ? Number(wmsCounters.orders_delayed) || 0 : 0);
      setPackingBraki(wmsCounters != null ? Number(wmsCounters.packing_braki) || 0 : 0);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return undefined;
    const unsubShortages = subscribeWmsShortagesUpdated(() => void load(), { debounceMs: 1200 });
    const onOrders = () => void load();
    window.addEventListener(ORDERS_OPERATIONS_UPDATED_EVENT, onOrders);
    return () => {
      unsubShortages();
      window.removeEventListener(ORDERS_OPERATIONS_UPDATED_EVENT, onOrders);
    };
  }, [enabled, load]);

  const { nowe, wRealizacji } = useMemo(() => aggregateOrderBuckets(panelSummary), [panelSummary]);
  const opoznione = ordersDelayed;
  const pilne = packingBraki;
  const countsDisabled = loading;
  /** Sum of packing braki + delayed orders — badge on top-bar notification bell. */
  const alertCount = Math.max(0, (Number(pilne) || 0) + (Number(opoznione) || 0));

  return {
    user,
    showWarehouseSelector,
    nowe,
    wRealizacji,
    pilne,
    opoznione,
    countsDisabled,
    alertCount,
    loading,
  };
}
