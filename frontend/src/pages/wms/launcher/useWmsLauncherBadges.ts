import { useCallback, useEffect, useState } from "react";

import { fetchWmsActiveInventoryDocuments } from "@/api/inventoryCountApi";
import { getWarehouseOperationsSnapshot } from "@/api/warehouseOperationsApi";
import { listWmsOrderIssueTasks } from "@/api/wmsOrderIssueTasksApi";
import { DAMAGE_TENANT_ID } from "@/pages/damage/damageShared";
import type { WmsTabId } from "../wmsTabConfig";
import type { WmsLauncherBadgeMap, WmsModuleBadge } from "./wmsLauncherTypes";

function countBadge(n: number, tone: WmsModuleBadge["tone"] = "active"): WmsModuleBadge | undefined {
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return { label: String(Math.min(999, Math.floor(n))), tone };
}

function alertBadge(label: string): WmsModuleBadge {
  return { label, tone: "critical" };
}

export function useWmsLauncherBadges(warehouseId: number | null) {
  const [badges, setBadges] = useState<WmsLauncherBadgeMap>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (warehouseId == null || warehouseId <= 0) {
      setBadges({});
      return;
    }
    setLoading(true);
    try {
      const next: WmsLauncherBadgeMap = {};
      const [issues, snapshot, inventoryDocs] = await Promise.all([
        listWmsOrderIssueTasks(DAMAGE_TENANT_ID, warehouseId).catch(() => ({ tasks: [] as unknown[] })),
        getWarehouseOperationsSnapshot({ tenantId: DAMAGE_TENANT_ID, warehouseId }).catch(() => null),
        fetchWmsActiveInventoryDocuments(DAMAGE_TENANT_ID, warehouseId).catch(() => []),
      ]);

      const issueCount = issues.tasks?.length ?? 0;
      if (issueCount > 0) {
        next.issues = issueCount >= 10 ? alertBadge("!") : countBadge(issueCount, "critical");
      }

      const summary = snapshot?.summary;
      if (summary) {
        next.picking = countBadge(summary.picking);
        next.packing = countBadge(summary.packing);
        next.receiving = countBadge(summary.inbound_deliveries_waiting, "warning");
        next.putaway = countBadge(summary.products_waiting_putaway, "warning");
        if (summary.blocked_orders > 0) {
          next.operations = countBadge(summary.blocked_orders, "warning");
        }
      }

      const invCount = inventoryDocs.length;
      if (invCount > 0) {
        next.inventory_count = countBadge(invCount);
      }

      setBadges(next);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { badges, loading, refresh };
}

export type { WmsTabId };
