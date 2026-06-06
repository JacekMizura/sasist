import { useMemo } from "react";

import type { OperationalAlert } from "../../api/operationalAlertsApi";
import { safeIncludes, safeUpper } from "../../utils/safeStrings";
import type { ZonePressure } from "../runtime/useZonePressure";
import type { OperatorSnapshot } from "../runtime/useOperatorRuntime";
import { zoneDisplayName, zonePressureLabel } from "../../services/operations/operationsTerminology";

export type DashboardKpi = {
  id: string;
  emoji: string;
  label: string;
  value: number;
  tone: "red" | "amber" | "green" | "blue";
};

export type ActionFeedItem = {
  id: string;
  severity: "critical" | "warning" | "info";
  text: string;
  at: string | null;
  ctaPrimary?: { label: string; action: string };
  ctaSecondary?: { label: string; action: string };
  alertId?: number;
};

type Args = {
  alerts: OperationalAlert[];
  replenishmentOpen: number;
  self: OperatorSnapshot | null;
  peers: OperatorSnapshot[];
  zones: ZonePressure[];
  tasksToday: number;
};

export function useOperationsDashboard({
  alerts,
  replenishmentOpen,
  self,
  peers,
  zones,
  tasksToday,
}: Args) {
  const kpis: DashboardKpi[] = useMemo(() => {
    const urgent = alerts.filter(
      (a) =>
        safeUpper(a.severity) === "CRITICAL" ||
        safeIncludes(a.alert_type, "SHORTAGE") ||
        safeIncludes(a.title, "brak"),
    ).length;
    const activeOps = peers.length + (self ? 1 : 0);
    return [
      { id: "shortages", emoji: "🔴", label: "Pilne braki", value: urgent, tone: "red" },
      { id: "replenish", emoji: "🟡", label: "Uzupełnienia", value: replenishmentOpen, tone: "amber" },
      { id: "operators", emoji: "🟢", label: "Aktywni operatorzy", value: activeOps, tone: "green" },
      { id: "orders", emoji: "🔵", label: "Zadania dziś", value: tasksToday, tone: "blue" },
    ];
  }, [alerts, replenishmentOpen, self, peers, tasksToday]);

  const actionFeed: ActionFeedItem[] = useMemo(() => {
    const items: ActionFeedItem[] = [];
    for (const z of zones) {
      if (z.level === "LOW" || z.lowStockCount > 0) {
        items.push({
          id: `zone-low-${z.zone}`,
          severity: "warning",
          text: `Niski stan w ${zoneDisplayName(z.zone).toLowerCase()}`,
          at: null,
          ctaPrimary: { label: "Przejdź", action: "replenishment" },
        });
      }
      if (z.level === "PRESSURE") {
        items.push({
          id: `zone-pressure-${z.zone}`,
          severity: "warning",
          text: `${zoneDisplayName(z.zone)} — ${zonePressureLabel("PRESSURE").toLowerCase()}`,
          at: null,
          ctaPrimary: { label: "Przypisz", action: "tasks" },
        });
      }
      if (z.activeOperators === 0 && (z.openReplenishments > 0 || z.taskCount > 0)) {
        items.push({
          id: `zone-no-op-${z.zone}`,
          severity: "critical",
          text: `Brak operatora w ${zoneDisplayName(z.zone).toLowerCase()}`,
          at: null,
          ctaPrimary: { label: "Przypisz", action: "operators" },
        });
      }
    }
    for (const a of alerts.slice(0, 12)) {
      const sev =
        safeUpper(a.severity) === "CRITICAL" || safeUpper(a.severity) === "HIGH"
          ? "critical"
          : safeUpper(a.severity) === "WARNING"
            ? "warning"
            : "info";
      items.push({
        id: `alert-${a.id}`,
        severity: sev,
        text: a.title || a.message || "Wymaga reakcji",
        at: a.created_at ?? null,
        alertId: a.id,
        ctaPrimary: { label: "Rozwiąż", action: "alerts" },
        ctaSecondary: { label: "Eskaluj", action: "escalate" },
      });
    }
    const staleRepl = replenishmentOpen > 0;
    if (staleRepl) {
      items.push({
        id: "repl-stale",
        severity: "warning",
        text: `Oczekujące uzupełnienia (${replenishmentOpen})`,
        at: null,
        ctaPrimary: { label: "Przejdź", action: "replenishment" },
      });
    }
    return items.slice(0, 10);
  }, [zones, alerts, replenishmentOpen]);

  return { kpis, actionFeed };
}
