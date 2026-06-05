import { useMemo } from "react";

import { useOperationalAlerts } from "./useOperationalAlerts";
import { useReplenishmentTasks } from "./useReplenishmentTasks";

export type ZonePressure = {
  zone: string;
  level: "OK" | "LOW" | "PRESSURE" | "BLOCKED";
  label: string;
  taskCount: number;
  alertCount: number;
};

const ZONES = ["SALES", "BACKROOM", "PICKFACE", "SHOWROOM", "PICKUP"] as const;

export function useZonePressure() {
  const { tasks } = useReplenishmentTasks();
  const { alerts } = useOperationalAlerts();

  const zones: ZonePressure[] = useMemo(() => {
    return ZONES.map((zone) => {
      const zoneTasks = tasks.filter((t) => {
        const hint = (t.location_hint ?? t.summary_line ?? "").toUpperCase();
        return hint.includes(zone) || t.task_type.includes(zone.slice(0, 4));
      });
      const zoneAlerts = alerts.filter((a) => {
        const blob = `${a.title} ${a.message ?? ""} ${JSON.stringify(a.payload ?? {})}`.toUpperCase();
        return blob.includes(zone);
      });
      const taskCount = zoneTasks.length;
      const alertCount = zoneAlerts.length;
      let level: ZonePressure["level"] = "OK";
      let label = "OK";
      if (alertCount > 0) {
        level = "BLOCKED";
        label = "BLOKADA";
      } else if (taskCount >= 3) {
        level = "PRESSURE";
        label = `${Math.min(99, taskCount * 18)}%`;
      } else if (taskCount > 0) {
        level = "LOW";
        label = "NISKI";
      }
      return { zone, level, label, taskCount, alertCount };
    });
  }, [tasks, alerts]);

  return { zones };
}
