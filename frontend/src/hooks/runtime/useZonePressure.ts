import { useMemo } from "react";

import { safeIncludes, safeTrim, safeUpper } from "../../utils/safeStrings";
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
        const zt = safeUpper(p.zone_type);
        const hint = safeUpper(t.location_hint ?? t.summary_line);
        const taskType = safeTrim(t.task_type);
        return (
          zt === zone ||
          safeIncludes(hint, zone) ||
          (taskType ? safeIncludes(taskType, zone.slice(0, 4)) : false)
        );
      });
      const zoneAlerts = alerts.filter((a) => {
        const blob = safeUpper(`${a.title ?? ""} ${a.message ?? ""} ${JSON.stringify(a.payload ?? {})}`);
        return safeIncludes(blob, zone);
      });
      const lowStockCount = zoneAlerts.filter((a) => safeIncludes(a.alert_type, "LOW")).length;
      const openReplenishments = zoneTasks.filter((t) => t.status !== "done").length;
      const blockedTasks = zoneTasks.filter((t) => orchColumn(t) === "BLOCKED").length;
      const activeOperators =
        peers.filter((p) => safeIncludes(p.zoneLabel, zone)).length +
        (selfSnapshot && safeIncludes(selfSnapshot.zoneLabel, zone) ? 1 : 0);
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
