import { useCallback, useEffect, useState } from "react";

import { fetchWmsActiveInventoryDocuments } from "@/api/inventoryCountApi";
import { fetchWmsConsolidationSummary } from "@/api/wmsConsolidationApi";
import { getWarehouseOperationsSnapshot } from "@/api/warehouseOperationsApi";
import { listWmsOrderIssueTasks } from "@/api/wmsOrderIssueTasksApi";
import { DAMAGE_TENANT_ID } from "@/pages/damage/damageShared";
import type { WmsTabId } from "../wmsTabConfig";
import type { WmsLauncherMetricsMap, WmsModuleStatChip, WmsModuleTileMetrics } from "./wmsLauncherTypes";

function stat(label: string, tone: WmsModuleStatChip["tone"] = "neutral"): WmsModuleStatChip {
  return { label, tone };
}

function setMetrics(
  map: WmsLauncherMetricsMap,
  id: WmsTabId,
  stats: WmsModuleStatChip[],
): void {
  if (stats.length === 0) return;
  map[id] = { stats };
}

export function useWmsLauncherBadges(warehouseId: number | null) {
  const [metrics, setMetricsState] = useState<WmsLauncherMetricsMap>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (warehouseId == null || warehouseId <= 0) {
      setMetricsState({});
      return;
    }
    setLoading(true);
    try {
      const next: WmsLauncherMetricsMap = {};
      const [issues, snapshot, inventoryDocs, consolidationSummary] = await Promise.all([
        listWmsOrderIssueTasks(DAMAGE_TENANT_ID, warehouseId).catch(() => ({ tasks: [] as unknown[] })),
        getWarehouseOperationsSnapshot({ tenantId: DAMAGE_TENANT_ID, warehouseId }),
        fetchWmsActiveInventoryDocuments(DAMAGE_TENANT_ID, warehouseId).catch(() => []),
        fetchWmsConsolidationSummary(DAMAGE_TENANT_ID, warehouseId).catch(() => null),
      ]);

      const issueCount = issues.tasks?.length ?? 0;
      if (issueCount > 0) {
        setMetrics(next, "issues", [stat(`${issueCount} ${issueCount === 1 ? "zadanie" : "zadań"}`, "critical")]);
      }

      const summary = snapshot?.summary;
      if (summary) {
        const picking = summary.picking ?? 0;
        const packing = summary.packing ?? 0;
        const inbound = summary.inbound_deliveries_waiting ?? 0;
        const putaway = summary.products_waiting_putaway ?? 0;
        const blocked = summary.blocked_orders ?? 0;

        if (picking > 0) {
          setMetrics(next, "picking", [stat(`${picking} aktywnych`, "info")]);
        }
        if (packing > 0) {
          setMetrics(next, "packing", [stat(`${packing} aktywnych`, "info")]);
        }
        if (inbound > 0) {
          setMetrics(next, "receiving", [stat(`${inbound} oczekujących`, "warning")]);
        }
        if (putaway > 0) {
          setMetrics(next, "putaway", [stat(`${putaway} do rozlokowania`, "warning")]);
        }
        if (blocked > 0) {
          setMetrics(next, "operations", [stat(`${blocked} zablokowanych`, "warning")]);
        }
      }

      const invCount = inventoryDocs.length;
      const conflictSum = inventoryDocs.reduce((sum, doc) => sum + (doc.conflict_count ?? 0), 0);
      const invStats: WmsModuleStatChip[] = [];
      if (conflictSum > 0) {
        invStats.push(stat(`${conflictSum} ${conflictSum === 1 ? "konflikt" : "konflikty"}`, "warning"));
      }
      if (invCount > 0) {
        invStats.push(stat(`${invCount} aktywnych`, "info"));
      }
      setMetrics(next, "inventory_count", invStats);

      if (consolidationSummary) {
        const consStats: WmsModuleStatChip[] = [];
        if (consolidationSummary.problem_plan_count > 0) {
          consStats.push(
            stat(`${consolidationSummary.problem_plan_count} z problemami`, "critical"),
          );
        }
        if (consolidationSummary.manual_review_count > 0) {
          consStats.push(
            stat(`${consolidationSummary.manual_review_count} decyzji`, "warning"),
          );
        }
        if (consolidationSummary.critical_alert_count > 0) {
          consStats.push(
            stat(`${consolidationSummary.critical_alert_count} krytycznych`, "critical"),
          );
        }
        if (consolidationSummary.pending_count > 0) {
          consStats.push(stat(`${consolidationSummary.pending_count} oczekujących`, "warning"));
        }
        if (consolidationSummary.in_progress_count > 0) {
          consStats.push(stat(`${consolidationSummary.in_progress_count} w toku`, "info"));
        }
        setMetrics(next, "consolidations", consStats);
      }

      setMetricsState(next);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { metrics, loading, refresh };
}

export type { WmsTabId, WmsModuleTileMetrics };
