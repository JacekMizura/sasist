import { useCallback, useEffect, useMemo, useState } from "react";

import { getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import { getWmsDashboardSummary, type WmsDashboardSummary } from "../../api/wmsDashboardApi";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../pages/damage/damageShared";
import { ORDERS_OPERATIONS_UPDATED_EVENT, WMS_SHORTAGES_UPDATED_EVENT } from "../../pages/wms/wmsRoutes";
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

/** Dane do paska KPI w szkielecie ERP (nie używać w layoucie WMS). */
export function usePanelOrderKpis(opts?: UsePanelOrderKpisOpts) {
  const enabled = opts?.enabled !== false;
  const { user } = useAuth();
  const { warehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [panelSummary, setPanelSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [wmsSummary, setWmsSummary] = useState<WmsDashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setPanelSummary(null);
      setWmsSummary(null);
      setLoading(false);
      return;
    }
    if (warehouseId == null) {
      setPanelSummary(null);
      setWmsSummary(null);
      return;
    }
    setLoading(true);
    try {
      const [summary, wms] = await Promise.all([
        getOrderUiStatusSummary(DAMAGE_TENANT_ID, warehouseId).catch(() => null),
        getWmsDashboardSummary(DAMAGE_TENANT_ID, warehouseId).catch(() => null),
      ]);
      setPanelSummary(summary);
      setWmsSummary(wms);
    } finally {
      setLoading(false);
    }
  }, [enabled, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const on = () => void load();
    window.addEventListener(WMS_SHORTAGES_UPDATED_EVENT, on);
    window.addEventListener(ORDERS_OPERATIONS_UPDATED_EVENT, on);
    return () => {
      window.removeEventListener(WMS_SHORTAGES_UPDATED_EVENT, on);
      window.removeEventListener(ORDERS_OPERATIONS_UPDATED_EVENT, on);
    };
  }, [enabled, load]);

  const { nowe, wRealizacji } = useMemo(() => aggregateOrderBuckets(panelSummary), [panelSummary]);
  const opoznione = wmsSummary != null ? Number(wmsSummary.orders_delayed) || 0 : 0;
  const pilne = wmsSummary != null ? Number(wmsSummary.packing_braki) || 0 : 0;
  const countsDisabled = warehouseId == null || loading;
  const alertCount = wmsSummary?.alerts?.length ?? 0;

  return {
    user,
    warehouse,
    showWarehouseSelector,
    warehouseId,
    nowe,
    wRealizacji,
    pilne,
    opoznione,
    countsDisabled,
    alertCount,
    wmsSummary,
    loading,
  };
}
