import type { WmsPackingOrderCardApi, WmsOrderTimelineEventApi } from "../../api/wmsPackingApi";
import { getOrderEventLabel } from "../../utils/orderEventLabels";

export type OrderHistoryBadgeTone = "muted" | "dark" | "blue";

export type OrderHistoryTimelineVariant =
  | "note"
  | "status_manual"
  | "status_auto"
  | "system_simple"
  | "panel_change"
  | "wms_event";

export type OrderHistoryDetailRow = {
  label: string;
  value: string;
};

export type OrderHistoryTimelineEvent = {
  key: string;
  at: string;
  variant: OrderHistoryTimelineVariant;
  title: string;
  badge?: { label: string; tone: OrderHistoryBadgeTone };
  userName?: string | null;
  description?: string | null;
  details?: OrderHistoryDetailRow[];
  automationLabel?: string | null;
};

export type OrderHistoryTimelineOrderInput = {
  id: number;
  created_at?: string | null;
  panel_fulfillment_history?: {
    at: string;
    lines: string[];
    kind?: string | null;
    product_name?: string | null;
  }[];
  order_activity_logs?: {
    id: number;
    event_type: string;
    message: string;
    created_at?: string | null;
  }[];
};

export type BuildOrderHistoryOptions = {
  /**
   * `wms` — only WMS audit timeline (Historia WMS sidebar).
   * `full` — legacy mix of panel + activity + WMS (other surfaces).
   */
  mode?: "wms" | "full";
};

function panelHistoryTitle(kind: string): string {
  const k = kind.trim();
  if (k === "order_line_removed") return "Zmiana zamówienia";
  if (k === "shortage_reduced") return "Korekta ilości (brak)";
  return "Zapis historii realizacji";
}

function isNoteActivity(log: { event_type: string; message: string }): boolean {
  const et = (log.event_type ?? "").toUpperCase();
  if (et.includes("NOTE")) return true;
  const m = (log.message ?? "").trim();
  return /\bnotatk/i.test(m) || /^dodano notatk/i.test(m);
}

function inferStatusBadge(msg: string): { label: string; tone: OrderHistoryBadgeTone } | null {
  const m = msg.trim();
  if (/do zbierania/i.test(m)) return { label: "Do zbierania", tone: "blue" };
  const pickInProgress = m.match(/w\s*zbieraniu\s*(\d+\/\d+)/i);
  if (pickInProgress) return { label: `W zbieraniu ${pickInProgress[1]}`, tone: "dark" };
  if (/w zbieraniu/i.test(m)) return { label: "W zbieraniu", tone: "dark" };
  return null;
}

function inferAutomationLabel(msg: string): string | null {
  const m = msg.trim();
  const idMatch = m.match(/#\s*(\d+)/);
  if (/automatycz/i.test(m)) {
    return idMatch ? `Akcja automatyczna #${idMatch[1]}` : "Akcja automatyczna";
  }
  return null;
}

function mapWmsTimelineEvent(ev: WmsOrderTimelineEventApi, wi: number): OrderHistoryTimelineEvent {
  const at = typeof ev.at === "string" ? ev.at : String(ev.at);
  const rawBadge = (ev.badge ?? "").trim();
  const detailRows = (ev.details ?? [])
    .map((d) => ({
      label: String(d.label ?? "").trim(),
      value: String(d.value ?? "").trim(),
    }))
    .filter((d) => d.label && d.value);
  const bodyLines = (ev.body ?? []).map((x) => String(x).trim()).filter(Boolean);
  return {
    key: `wms-tl-${wi}-${at}-${ev.title}-${ev.event_type ?? ""}`,
    at,
    variant: "wms_event",
    title: ev.title,
    // Historia WMS is already scoped — omit redundant WMS badge
    badge: rawBadge && rawBadge.toUpperCase() !== "WMS" ? { label: rawBadge, tone: "muted" } : undefined,
    userName: (ev.user_label ?? "").trim() || null,
    details: detailRows.length ? detailRows : undefined,
    description: detailRows.length ? null : bodyLines.length ? bodyLines.join(" · ") : null,
  };
}

/** Najnowsze na górze (jak w makiecie Sellasist). */
export function buildOrderHistoryTimelineEvents(
  order: OrderHistoryTimelineOrderInput,
  wmsFulfillment: WmsPackingOrderCardApi | null | undefined,
  options?: BuildOrderHistoryOptions,
): OrderHistoryTimelineEvent[] {
  const mode = options?.mode ?? "full";
  const rows: OrderHistoryTimelineEvent[] = [];

  const wmsTl = wmsFulfillment?.timeline ?? wmsFulfillment?.wms_timeline ?? [];

  if (mode === "wms") {
    for (let wi = 0; wi < wmsTl.length; wi += 1) {
      rows.push(mapWmsTimelineEvent(wmsTl[wi]!, wi));
    }
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }

  if (order.created_at) {
    rows.push({
      key: "created",
      at: order.created_at,
      variant: "system_simple",
      title: "Pobranie zamówienia",
    });
  }

  (order.panel_fulfillment_history ?? []).forEach((e, idx) => {
    const kind = (e.kind ?? "").trim();
    const parts: string[] = [];
    if ((e.product_name ?? "").trim()) parts.push(String(e.product_name).trim());
    for (const ln of e.lines ?? []) {
      if (typeof ln === "string" && ln.trim()) parts.push(ln.trim());
    }
    const description = parts.length ? parts.join(" · ") : null;
    rows.push({
      key: `pfh-${idx}-${e.at}`,
      at: e.at,
      variant: "panel_change",
      title: panelHistoryTitle(kind),
      description,
    });
  });

  const wmsAuditActivitySkip = new Set([
    "PICKING_STARTED",
    "PICKED_ITEM",
    "PICKING_FINISHED",
    "PACKING_STARTED",
    "PACKED_ITEM",
    "PACKING_PAUSED",
    "PACKING_RESUMED",
    "PACKING_FINISHED",
    "PACKING_AUTOMATION_FINISHED",
    "SHORTAGE_REPORTED",
    "CARTON_SELECTED",
    "CARTON_CHANGED",
    "LABEL_GENERATED",
    "LABEL_REPRINTED",
    "PACKAGE_WEIGHT_CONFIRMED",
  ]);
  for (let wi = 0; wi < wmsTl.length; wi += 1) {
    rows.push(mapWmsTimelineEvent(wmsTl[wi]!, wi));
  }

  for (const log of order.order_activity_logs ?? []) {
    const etSkip = (log.event_type ?? "").trim().toUpperCase();
    if (wmsTl.length > 0 && wmsAuditActivitySkip.has(etSkip)) {
      continue;
    }
    const at = log.created_at ?? "";
    const msg = (log.message ?? "").trim();
    if (!at && !msg) continue;

    if (isNoteActivity(log)) {
      rows.push({
        key: `oal-note-${log.id}`,
        at: at || new Date(0).toISOString(),
        variant: "note",
        title: "Dodano notatkę",
        description: msg || "—",
      });
      continue;
    }

    const auto = inferAutomationLabel(msg);
    const statusBadge = inferStatusBadge(msg);
    if (statusBadge || auto) {
      rows.push({
        key: `oal-st-${log.id}`,
        at: at || new Date(0).toISOString(),
        variant: auto ? "status_auto" : "status_manual",
        title: "Zmiana statusu",
        ...(statusBadge ? { badge: statusBadge } : {}),
        automationLabel: auto ?? undefined,
      });
      continue;
    }

    rows.push({
      key: `oal-${log.id}`,
      at: at || new Date(0).toISOString(),
      variant: "panel_change",
      title: getOrderEventLabel(log.event_type),
      description: msg || null,
    });
  }

  return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
