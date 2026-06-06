import type { LiveEvent } from "../../api/operationalRuntimeApi";
import {
  operatorActivityLabel,
  taskTypeLabel,
  zoneDisplayName,
} from "../../services/operations/operationsTerminology";
import { safeTrim } from "../../utils/safeStrings";

export type FeedLine = {
  id: string;
  tone: "info" | "warn" | "success" | "muted";
  text: string;
  at?: string | null;
};

export function formatLiveEventFeedLine(ev: LiveEvent): FeedLine {
  const p = ev.payload ?? {};
  const at = ev.created_at ?? null;
  const eventType = safeTrim(ev.event_type) || "unknown";
  switch (eventType) {
    case "replenishment.alert":
      return {
        id: `ev-${ev.id}`,
        tone: "warn",
        text: `Wykryto potrzebę uzupełnienia w ${zoneDisplayName(p.zone_type).toLowerCase()}`,
        at,
      };
    case "task.assigned":
      return {
        id: `ev-${ev.id}`,
        tone: "info",
        text: `Przypisano zadanie operacyjne`,
        at,
      };
    case "task.updated":
      return {
        id: `ev-${ev.id}`,
        tone: "muted",
        text: `Zaktualizowano zadanie ${taskTypeLabel(p.task_type).toLowerCase()}`,
        at,
      };
    case "pickup.ready":
      return {
        id: `ev-${ev.id}`,
        tone: "success",
        text: `Zamówienie gotowe do odbioru`,
        at,
      };
    case "direct_sale.updated":
      return {
        id: `ev-${ev.id}`,
        tone: "info",
        text: `Sprzedaż bezpośrednia — nowa pozycja`,
        at,
      };
    case "alert.created":
      return {
        id: `ev-${ev.id}`,
        tone: p.severity === "CRITICAL" ? "warn" : "info",
        text: String(p.title ?? "Nowy alert operacyjny"),
        at,
      };
    case "stock.changed":
      return {
        id: `ev-${ev.id}`,
        tone: "muted",
        text: `Zmiana stanu magazynowego`,
        at,
      };
    case "runtime.context.updated":
      return {
        id: `ev-${ev.id}`,
        tone: "info",
        text: `Operator ${operatorActivityLabel(p.context_type).toLowerCase()}`,
        at,
      };
    case "reservation.updated":
      return {
        id: `ev-${ev.id}`,
        tone: "warn",
        text: `Zaktualizowano rezerwację towaru`,
        at,
      };
    case "document.generated":
      return {
        id: `ev-${ev.id}`,
        tone: "success",
        text: `Wygenerowano dokument sprzedaży`,
        at,
      };
    case "document.failed":
      return {
        id: `ev-${ev.id}`,
        tone: "warn",
        text: `Problem z dokumentem — wymaga uwagi`,
        at,
      };
    case "picking.started":
    case "picking.finalized":
      return {
        id: `ev-${ev.id}`,
        tone: "info",
        text: eventType.includes("finalized") ? "Zakończono zbieranie" : "Operator rozpoczął zbieranie",
        at,
      };
    case "packing.completed":
      return {
        id: `ev-${ev.id}`,
        tone: "success",
        text: "Zakończono pakowanie",
        at,
      };
    case "shortage.reported":
      return {
        id: `ev-${ev.id}`,
        tone: "warn",
        text: "Wykryto brak podczas zbierania",
        at,
      };
    default:
      return {
        id: `ev-${ev.id}`,
        tone: "muted",
        text: "Aktywność magazynowa",
        at,
      };
  }
}
