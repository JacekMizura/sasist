import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";

import { fetchWmsActiveInventoryDocuments } from "@/api/inventoryCountApi";
import { fetchWmsConsolidationSummary } from "@/api/wmsConsolidationApi";
import { getWarehouseOperationsSnapshot } from "@/api/warehouseOperationsApi";
import { listWmsOrderIssueTasks } from "@/api/wmsOrderIssueTasksApi";
import { DAMAGE_TENANT_ID } from "@/pages/damage/damageShared";
import type { WmsTabId } from "../wmsTabConfig";
import type { WmsHomeKpiKey } from "./wmsHomeSections";
import type { WmsLauncherMetricsMap, WmsModuleStatChip, WmsModuleTileMetrics } from "./wmsLauncherTypes";

function stat(label: string, tone: WmsModuleStatChip["tone"] = "neutral"): WmsModuleStatChip {
  return { label, tone };
}

function setMetrics(
  map: WmsLauncherMetricsMap,
  id: WmsTabId,
  stats: WmsModuleStatChip[],
  count?: number,
): void {
  if (stats.length === 0 && (count == null || count <= 0)) return;
  map[id] = { stats, count: count ?? 0 };
}

export type WmsHomeKpiCounts = Record<WmsHomeKpiKey, number> & {
  mm: number;
  consolidations: number;
  inventory_count: number;
};

/**
 * KPI „Braki” semantics (SSOT: GET /wms/order-issue-tasks):
 * liczba aktywnych zadań OrderIssueTask w kolejce Braki dla magazynu
 * (po deduplikacji po order_id) — nie sztuki i nie linie produktowe.
 */
export type WmsHomeKpiMeta = {
  issuesError: string | null;
  issuesLoading: boolean;
};

const EMPTY_KPI: WmsHomeKpiCounts = {
  picking: 0,
  packing: 0,
  issues: 0,
  putaway: 0,
  receiving: 0,
  mm: 0,
  consolidations: 0,
  inventory_count: 0,
};

function issuesErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (detail && typeof detail === "object" && "message" in detail) {
      const msg = (detail as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
    if (err.response?.status === 500) {
      return "Nie udało się wczytać kolejki Braki.";
    }
  }
  return "Nie udało się pobrać liczby braków.";
}

export function useWmsLauncherBadges(warehouseId: number | null) {
  const [metrics, setMetricsState] = useState<WmsLauncherMetricsMap>({});
  const [kpi, setKpi] = useState<WmsHomeKpiCounts>(EMPTY_KPI);
  const [kpiMeta, setKpiMeta] = useState<WmsHomeKpiMeta>({ issuesError: null, issuesLoading: false });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (warehouseId == null || warehouseId <= 0) {
      setMetricsState({});
      setKpi(EMPTY_KPI);
      setKpiMeta({ issuesError: null, issuesLoading: false });
      return;
    }
    setLoading(true);
    setKpiMeta((m) => ({ ...m, issuesLoading: true }));
    try {
      const next: WmsLauncherMetricsMap = {};
      const nextKpi: WmsHomeKpiCounts = { ...EMPTY_KPI };

      const issuesResult = await listWmsOrderIssueTasks(DAMAGE_TENANT_ID, warehouseId)
        .then((data) => ({ ok: true as const, data }))
        .catch((err: unknown) => ({ ok: false as const, err }));

      const [snapshot, inventoryDocs, consolidationSummary] = await Promise.all([
        getWarehouseOperationsSnapshot({ tenantId: DAMAGE_TENANT_ID, warehouseId }).catch(() => null),
        fetchWmsActiveInventoryDocuments(DAMAGE_TENANT_ID, warehouseId).catch(() => []),
        fetchWmsConsolidationSummary(DAMAGE_TENANT_ID, warehouseId).catch(() => null),
      ]);

      if (issuesResult.ok) {
        const issueCount = issuesResult.data.tasks?.length ?? 0;
        nextKpi.issues = issueCount;
        setKpiMeta({ issuesError: null, issuesLoading: false });
        if (issueCount > 0) {
          setMetrics(
            next,
            "issues",
            [stat(`${issueCount} ${issueCount === 1 ? "zadanie" : "zadań"}`, "critical")],
            issueCount,
          );
        }
      } else {
        // Do NOT present failure as a successful 0.
        setKpiMeta({ issuesError: issuesErrorMessage(issuesResult.err), issuesLoading: false });
      }

      const summary = snapshot?.summary;
      if (summary) {
        const picking = summary.picking ?? 0;
        const packing = summary.packing ?? 0;
        const inbound = summary.inbound_deliveries_waiting ?? 0;
        const putaway = summary.products_waiting_putaway ?? 0;
        const blocked = summary.blocked_orders ?? 0;

        nextKpi.picking = picking;
        nextKpi.packing = packing;
        nextKpi.receiving = inbound;
        nextKpi.putaway = putaway;

        if (picking > 0) {
          setMetrics(next, "picking", [stat(`${picking} aktywnych`, "info")], picking);
        }
        if (packing > 0) {
          setMetrics(next, "packing", [stat(`${packing} aktywnych`, "info")], packing);
        }
        if (inbound > 0) {
          setMetrics(next, "receiving", [stat(`${inbound} oczekujących`, "warning")], inbound);
        }
        if (putaway > 0) {
          setMetrics(next, "putaway", [stat(`${putaway} do rozlokowania`, "warning")], putaway);
        }
        if (blocked > 0) {
          setMetrics(next, "operations", [stat(`${blocked} zablokowanych`, "warning")], blocked);
        }
      }

      const invCount = inventoryDocs.length;
      const conflictSum = inventoryDocs.reduce((sum, doc) => sum + (doc.conflict_count ?? 0), 0);
      nextKpi.inventory_count = invCount;
      const invStats: WmsModuleStatChip[] = [];
      if (conflictSum > 0) {
        invStats.push(stat(`${conflictSum} ${conflictSum === 1 ? "konflikt" : "konflikty"}`, "warning"));
      }
      if (invCount > 0) {
        invStats.push(stat(`${invCount} aktywnych`, "info"));
      }
      setMetrics(next, "inventory_count", invStats, invCount);

      if (consolidationSummary) {
        const pending =
          (consolidationSummary.pending_count ?? 0) + (consolidationSummary.in_progress_count ?? 0);
        nextKpi.consolidations = pending;
        nextKpi.mm = pending;
        const consStats: WmsModuleStatChip[] = [];
        if (consolidationSummary.problem_plan_count > 0) {
          consStats.push(stat(`${consolidationSummary.problem_plan_count} z problemami`, "critical"));
        }
        if (consolidationSummary.manual_review_count > 0) {
          consStats.push(stat(`${consolidationSummary.manual_review_count} decyzji`, "warning"));
        }
        if (consolidationSummary.critical_alert_count > 0) {
          consStats.push(stat(`${consolidationSummary.critical_alert_count} krytycznych`, "critical"));
        }
        if (consolidationSummary.pending_count > 0) {
          consStats.push(stat(`${consolidationSummary.pending_count} oczekujących`, "warning"));
        }
        if (consolidationSummary.in_progress_count > 0) {
          consStats.push(stat(`${consolidationSummary.in_progress_count} w toku`, "info"));
        }
        setMetrics(next, "consolidations", consStats, pending);
      }

      setMetricsState(next);
      setKpi(nextKpi);
    } finally {
      setLoading(false);
      setKpiMeta((m) => ({ ...m, issuesLoading: false }));
    }
  }, [warehouseId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { metrics, kpi, kpiMeta, loading, refresh };
}

export type { WmsTabId, WmsModuleTileMetrics };
