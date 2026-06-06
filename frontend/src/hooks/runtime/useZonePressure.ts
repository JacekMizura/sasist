import { useMemo } from "react";

import { orchColumn } from "../../utils/replenishmentRowModel";
import { useOperationalAlerts } from "./useOperationalAlerts";
import { useOperatorRuntime } from "./useOperatorRuntime";
import { useReplenishmentTasks } from "./useReplenishmentTasks";

export type ZonePressure = {
  zone: string;
  level: "OK" | "LOW" | "PRESSURE" | "BLOCKED";
  label: string;
  taskCount: number;
  alertCount: number;
  lowStockCount: number;
  openReplenishments: number;
  blockedTasks: number;
  activeOperators: number;
  queuePressure: number;
};

const ZONES = ["SALES", "BACKROOM", "PICKFACE", "SHOWROOM", "PICKUP"] as const;

export function useZonePressure() {
  const { tasks } = useReplenishmentTasks();
  const { alerts } = useOperationalAlerts();
  const { peers, selfSnapshot } = useOperatorRuntime();

  const zones: ZonePressure[] = useMemo(() => {
    return ZONES.map((zone) => {
      const zoneTasks = tasks.filter((t) => {
        const p = (t.task_payload ?? {}) as Record<string, unknown>;
        const zt = String(p.zone_type ?? "").toUpperCase();
        const hint = (t.location_hint ?? t.summary_line ?? "").toUpperCase();
        return zt === zone || hint.includes(zone) || t.task_type.includes(zone.slice(0, 4));
      });
      const zoneAlerts = alerts.filter((a) => {
        const blob = `${a.title} ${a.message ?? ""} ${JSON.stringify(a.payload ?? {})}`.toUpperCase();
        return blob.includes(zone);
      });
      const lowStockCount = zoneAlerts.filter((a) => a.alert_type.toUpperCase().includes("LOW")).length;
      const openReplenishments = zoneTasks.filter((t) => t.status !== "done").length;
      const blockedTasks = zoneTasks.filter((t) => orchColumn(t) === "BLOCKED").length;
      const activeOperators =
        peers.filter((p) => p.zoneLabel.toUpperCase().includes(zone)).length +
        (selfSnapshot?.zoneLabel.toUpperCase().includes(zone) ? 1 : 0);
      const queuePressure = Math.min(100, openReplenishments * 15 + blockedTasks * 25);
      const taskCount = zoneTasks.length;
      const alertCount = zoneAlerts.length;
      let level: ZonePressure["level"] = "OK";
      let label = "OK";
      if (alertCount > 0 || blockedTasks > 0) {
        level = "BLOCKED";
        label = "BLOKADA";
      } else if (queuePressure >= 45) {
        level = "PRESSURE";
        label = `${queuePressure}%`;
      } else if (openReplenishments > 0 || lowStockCount > 0) {
        level = "LOW";
        label = "NISKI";
      }
      return {
        zone,
        level,
        label,
        taskCount,
        alertCount,
        lowStockCount,
        openReplenishments,
        blockedTasks,
        activeOperators,
        queuePressure,
      };
    });
  }, [tasks, alerts, peers, selfSnapshot]);

  return { zones };
}
