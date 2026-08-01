import type { OrderHistoryTimelineEvent } from "../../orders/orderHistoryTimelineModel";

export function buildReturnDetailTimelineEvents(
  entries: { at: string; msg: string }[],
): OrderHistoryTimelineEvent[] {
  return entries.map((e, i) => {
    const msg = e.msg.toLowerCase();
    let title = e.msg;
    let variant: OrderHistoryTimelineEvent["variant"] = "system_simple";
    let badge: OrderHistoryTimelineEvent["badge"] | undefined;

    if (msg.includes("utworzono")) {
      title = "Utworzono";
      badge = { label: "System", tone: "muted" };
    } else if (msg.includes("status")) {
      title = "Zmieniono status";
      variant = "status_manual";
      badge = { label: "Status", tone: "blue" };
    } else if (msg.includes("korekt")) {
      title = "Utworzono korektę";
      badge = { label: "Dokument", tone: "dark" };
    } else if (msg.includes("przyję") || msg.includes("pozycja")) {
      title = e.msg;
      variant = "wms_event";
      badge = { label: "Produkt", tone: "muted" };
    } else if (msg.includes("zakończ")) {
      title = "Zakończono";
      badge = { label: "Koniec", tone: "dark" };
    }

    return {
      key: `rmz-ev-${i}-${e.at}`,
      at: e.at,
      variant,
      title,
      description: title === e.msg ? null : e.msg,
      badge,
    };
  });
}

export function returnStatusBadgeTone(type: string | null | undefined): {
  className: string;
  fallbackLabel: string;
} {
  if (type === "done_success") {
    return {
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      fallbackLabel: "Zakończony",
    };
  }
  if (type === "done_rejected") {
    return {
      className: "border-rose-200 bg-rose-50 text-rose-800",
      fallbackLabel: "Odrzucony",
    };
  }
  if (type === "in_progress") {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-900",
      fallbackLabel: "W trakcie",
    };
  }
  return {
    className: "border-blue-200 bg-blue-50 text-blue-800",
    fallbackLabel: "Nowy",
  };
}
