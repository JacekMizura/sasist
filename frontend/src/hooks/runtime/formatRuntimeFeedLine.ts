import type { LiveEvent } from "../../api/operationalRuntimeApi";
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
        text: `Uzupełnienie — produkt #${p.product_id ?? "?"} (${p.zone_type ?? "strefa"})`,
        at,
      };
    case "task.assigned":
      return {
        id: `ev-${ev.id}`,
        tone: "info",
        text: `Zadanie #${p.task_id ?? "?"} → operator #${p.operator_user_id ?? "?"}`,
        at,
      };
    case "task.updated":
      return {
        id: `ev-${ev.id}`,
        tone: "muted",
        text: `Zadanie #${p.task_id ?? "?"}: ${p.orchestration_state ?? p.status ?? "update"}`,
        at,
      };
    case "pickup.ready":
      return {
        id: `ev-${ev.id}`,
        tone: "success",
        text: `Pickup #${p.order_id ?? "?"} — gotowy do odbioru`,
        at,
      };
    case "direct_sale.updated":
      return {
        id: `ev-${ev.id}`,
        tone: "info",
        text: `Sprzedaż bezpośrednia — sesja #${p.session_id ?? "?"}`,
        at,
      };
    case "alert.created":
      return {
        id: `ev-${ev.id}`,
        tone: p.severity === "CRITICAL" ? "warn" : "info",
        text: String(p.title ?? "Alert operacyjny"),
        at,
      };
    case "stock.changed":
      return {
        id: `ev-${ev.id}`,
        tone: "muted",
        text: `Stan — produkt #${p.product_id ?? "?"}`,
        at,
      };
    case "runtime.context.updated":
      return {
        id: `ev-${ev.id}`,
        tone: "muted",
        text: `Operator #${p.operator_user_id ?? "?"} → ${p.context_type ?? "workflow"}`,
        at,
      };
    case "reservation.updated":
      return {
        id: `ev-${ev.id}`,
        tone: "warn",
        text: `Rezerwacja — produkt #${p.product_id ?? "?"}`,
        at,
      };
    case "document.generated":
      return {
        id: `ev-${ev.id}`,
        tone: "success",
        text: `Dokument wygenerowany — zamówienie #${p.order_id ?? "?"}`,
        at,
      };
    case "document.failed":
      return {
        id: `ev-${ev.id}`,
        tone: "warn",
        text: `Błąd dokumentu — job #${p.job_id ?? "?"}`,
        at,
      };
    default:
      return {
        id: `ev-${ev.id}`,
        tone: "muted",
        text: eventType,
        at,
      };
  }
}
