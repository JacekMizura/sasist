import type { ComplaintAuditEvent, ComplaintLineDetail } from "../../types/complaint";
import { COMPLAINT_STATUS_LABELS_PL, type ComplaintStatusCode } from "../../types/complaint";

export const COMPLAINT_TIMELINE_ACTOR = "System";

export type ComplaintHistoryRow = {
  id: string;
  at: number;
  dateLabel: string;
  actor: string;
  actionBold: string;
  detail?: string;
  /** Same-key rows within `DEDUPE_HISTORY_WINDOW_MS` (chronologically adjacent) collapse to the latest */
  dedupeKey?: string;
};

/** Time window for collapsing rapid duplicate events (see `dedupeComplaintHistoryRows`). */
export const DEDUPE_HISTORY_WINDOW_MS = 8000;

/** One-line journal cell: action + optional context in parentheses. */
export function formatComplaintJournalAction(row: ComplaintHistoryRow): string {
  const action = (row.actionBold ?? "").trim();
  const detail = (row.detail ?? "").trim();
  if (!detail) return action || "—";
  return `${action} — ${detail}`;
}

function parseTs(iso: string | null | undefined): number {
  if (!iso?.trim()) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Format: dd.MM.yyyy HH:mm (24h) */
export function formatComplaintAuditDateTime(iso: string | null | undefined): string {
  const t = parseTs(iso);
  if (!t) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(t));
}

/** Kontekst pozycji do dziennika: „Nazwa (#12)” lub „#12”. */
export function lineJournalRef(lines: ComplaintLineDetail[], lineId: number | undefined): string {
  if (lineId == null || !Number.isFinite(lineId)) return "";
  const ln = lines.find((l) => l.id === lineId);
  const name = (ln?.product_name ?? "").trim();
  if (name) return `${name} (#${lineId})`;
  return `#${lineId}`;
}

function decisionPl(raw: string | null | undefined): string {
  const d = String(raw ?? "").trim().toLowerCase();
  if (d === "repair") return "Naprawa";
  if (d === "exchange") return "Wymiana";
  if (d === "refund") return "Zwrot";
  if (d === "reject") return "Odrzucenie";
  return raw?.trim() || "—";
}

function statusPl(code: string | null | undefined): string {
  const u = String(code ?? "").trim().toUpperCase();
  if (u in COMPLAINT_STATUS_LABELS_PL) return COMPLAINT_STATUS_LABELS_PL[u as ComplaintStatusCode];
  return code?.trim() || "—";
}

/** Klucz operation_status (magazyn) → krótki opis */
const OP_STORAGE_PL: Record<string, string> = {
  pickup: "zarejestrowano etap odbioru",
  warehouse_in: "przyjęto na magazyn",
  service_sent: "wysłano do serwisu",
  repair_done: "zakończono naprawę",
  shipped_customer: "wysłano do klienta",
  order_placed: "złożono zamówienie wymiany",
  ship_out: "wysłano przesyłkę wychodzącą",
  return_customer: "zwrócono towar do klienta",
  refund_done: "zakończono zwrot środków",
};

const LINE_OPERATION_ACTION_PL: Record<string, string> = {
  CUSTOMER_PICKUP: "Zamówiono odbiór od klienta",
  PICKUP: "Zamówiono odbiór od klienta",
  WAREHOUSE_RECEIVED: "Przyjęto towar na magazyn",
  RECEIVED: "Przyjęto towar na magazyn",
  SENT_TO_SERVICE: "Wysłano produkt do serwisu",
  REPAIR_COMPLETED: "Zakończono naprawę",
  SHIPPED_TO_CUSTOMER: "Wysłano przesyłkę do klienta",
  EXCHANGE_ORDER_PLACED: "Złożono zamówienie wymiany",
  OUTBOUND_SHIPPED: "Wysłano przesyłkę wychodzącą",
  RETURNED_TO_CUSTOMER: "Zwrócono towar do klienta",
  REFUND_COMPLETED: "Zakończono zwrot środków na pozycji",
};

const RESOLUTION_TYPE_PL: Record<string, string> = {
  REPLACEMENT: "Wymiana",
  REFUND: "Pełny zwrot",
  PARTIAL_REFUND: "Częściowy zwrot",
  REJECTION: "Odmowa",
};

function metaRecord(m: unknown): Record<string, unknown> | null {
  return m && typeof m === "object" ? (m as Record<string, unknown>) : null;
}

/** Dedupe key for `line_update` / structured line payloads (same line + same field family). */
export function complaintLineUpdateDedupeKey(
  meta: Record<string, unknown> | null,
  lineId: number,
): string | undefined {
  if (!Number.isFinite(lineId)) return undefined;
  const dec = meta?.decision as { to?: string } | undefined;
  if (dec?.to) return `line:${lineId}:decision`;
  const op = meta?.operation_status as { to?: string | null } | undefined;
  if (op?.to) return `line:${lineId}:op:${String(op.to)}`;
  const ek = meta?.exchange_kind as { to?: string } | undefined;
  if (ek?.to) return `line:${lineId}:ex:${ek.to}`;
  const st = meta?.line_status as { to?: string } | undefined;
  if (st?.to) return `line:${lineId}:st:${st.to}`;
  return `line:${lineId}:edit`;
}

export function humanizeLineUpdate(
  meta: Record<string, unknown> | null,
  lines: ComplaintLineDetail[],
): { actionBold: string; detail?: string } {
  const lineId = typeof meta?.complaint_line_id === "number" ? meta.complaint_line_id : Number(meta?.complaint_line_id);
  const ref = Number.isFinite(lineId) ? lineJournalRef(lines, lineId) : "";

  const dec = meta?.decision as { to?: string; from?: string } | undefined;
  if (dec?.to) {
    return {
      actionBold: decisionPl(dec.to),
      detail: ref || undefined,
    };
  }

  const op = meta?.operation_status as { to?: string | null; from?: string | null } | undefined;
  if (op?.to) {
    const hint = OP_STORAGE_PL[String(op.to)] ?? String(op.to);
    return {
      actionBold: hint,
      detail: ref || undefined,
    };
  }

  const ek = meta?.exchange_kind as { to?: string; from?: string } | undefined;
  if (ek?.to) {
    const mode = ek.to === "REPLACEMENT" ? "Tylko dostawa" : ek.to === "EXCHANGE" ? "Odbiór + dostawa" : ek.to;
    return {
      actionBold: mode,
      detail: ref || undefined,
    };
  }

  const st = meta?.line_status as { to?: string; from?: string } | undefined;
  if (st?.to) {
    return {
      actionBold: statusPl(st.to),
      detail: ref || undefined,
    };
  }

  return {
    actionBold: "Pozycja",
    detail: ref || undefined,
  };
}

export function settlementTypePl(t: string | null | undefined): string {
  const u = String(t ?? "").trim().toUpperCase();
  return (RESOLUTION_TYPE_PL[u] ?? u) || "—";
}

/**
 * Zamienia wpis audytu z API na tekst dla operatora (PL).
 */
export function humanizeComplaintAuditEvent(
  e: ComplaintAuditEvent,
  index: number,
  lines: ComplaintLineDetail[],
): ComplaintHistoryRow {
  const at = parseTs(e.timestamp);
  const dateLabel = formatComplaintAuditDateTime(e.timestamp);
  const id = `audit-${index}-${e.timestamp}-${e.type}`;
  const meta = metaRecord(e.meta);
  const lineId = meta && typeof meta.complaint_line_id === "number" ? meta.complaint_line_id : Number(meta?.complaint_line_id);
  const ref = Number.isFinite(lineId) ? lineJournalRef(lines, lineId) : "";

  const t = String(e.type ?? "").trim();

  switch (t) {
    case "complaint_created":
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Utworzono reklamację",
        detail: undefined,
      };
    case "auto_accepted_by_law":
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Reklamacja uznana z mocy prawa",
        detail: "upłynął termin 14 dni na odpowiedź",
      };
    case "status_change": {
      const to = meta?.to as string | undefined;
      const isTerminal = to && ["ZAAKCEPTOWANA", "ODRZUCONA"].includes(String(to).toUpperCase());
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: isTerminal ? "Zamknięto reklamację" : statusPl(to),
        detail: undefined,
      };
    }
    case "defects_updated":
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Tagi wad",
        detail: undefined,
      };
    case "decision_update":
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Decyzje (flagi)",
        detail: undefined,
      };
    case "resolution_set": {
      const rt = String(meta?.resolution_type ?? "").trim().toUpperCase();
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: settlementTypePl(rt),
        detail: undefined,
      };
    }
    case "refund_created": {
      const amt = meta?.amount;
      const cur = meta?.currency;
      const d =
        typeof amt === "number" && Number.isFinite(amt)
          ? `${amt.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${String(cur ?? "").trim() || "PLN"}`
          : undefined;
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: d ?? "Kwota zwrotu",
        detail: undefined,
      };
    }
    case "replacement_order_created":
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Zamówienie wymiany",
        detail: undefined,
      };
    case "line_update": {
      const h = humanizeLineUpdate(meta, lines);
      const dedupeKey =
        Number.isFinite(lineId) && meta ? complaintLineUpdateDedupeKey(meta, lineId) : undefined;
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: h.actionBold,
        detail: h.detail,
        dedupeKey,
      };
    }
    case "line_operation": {
      const action = String(meta?.action ?? "").trim().toUpperCase();
      const phrase =
        LINE_OPERATION_ACTION_PL[action] ??
        (action ? action.replace(/_/g, " ").toLowerCase() : "Operacja pozycji");
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: phrase,
        detail: ref || undefined,
        dedupeKey: Number.isFinite(lineId) ? `line:${lineId}:lop:${action || "?"}` : undefined,
      };
    }
    case "line_settlement_saved": {
      const st = settlementTypePl(String(meta?.settlement_type ?? ""));
      const amt = meta?.amount;
      const cur = String(meta?.currency ?? "").trim() || "PLN";
      const amtStr =
        typeof amt === "number" && Number.isFinite(amt)
          ? `${amt.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
          : undefined;
      const detailParts = [amtStr, ref].filter(Boolean);
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: st,
        detail: detailParts.join(" — ") || undefined,
        dedupeKey: Number.isFinite(lineId) ? `line:${lineId}:settle:${String(meta?.settlement_type ?? "")}` : undefined,
      };
    }
    case "line_photos_added":
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Dodano zdjęcia na pozycjach zamówienia",
        detail: undefined,
      };
    case "customer_photos_added": {
      const itemId = meta?.complaint_item_id != null ? Number(meta.complaint_item_id) : NaN;
      const lc = Number.isFinite(itemId) ? lineJournalRef(lines, itemId) : "";
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: lc ? "Dodano zdjęcia do pozycji" : "Dodano zdjęcia od klienta",
        detail: lc || undefined,
      };
    }
    case "warehouse_photos_added": {
      const itemId = meta?.complaint_item_id != null ? Number(meta.complaint_item_id) : NaN;
      const lc = Number.isFinite(itemId) ? lineJournalRef(lines, itemId) : "";
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: lc ? "Dodano zdjęcia magazynowe na pozycji" : "Dodano zdjęcia magazynowe",
        detail: lc || undefined,
      };
    }
    case "defect_photos_added": {
      const itemId = meta?.complaint_item_id != null ? Number(meta.complaint_item_id) : NaN;
      const lc = Number.isFinite(itemId) ? lineJournalRef(lines, itemId) : "";
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Dodano zdjęcia dokumentujące wady",
        detail: lc || undefined,
      };
    }
    case "courier_ordered":
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Zamówiono odbiór kurierem",
        detail: undefined,
      };
    case "complaint_document_generated":
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Wygenerowano dokument PDF",
        detail: undefined,
      };
    case "complaint_documents_regenerated":
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Ponownie wygenerowano dokumenty",
        detail: undefined,
      };
    case "wms_update":
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Zapisano dane z inspekcji WMS",
        detail: undefined,
      };
    default: {
      return {
        id,
        at,
        dateLabel,
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Zdarzenie w systemie",
        detail: undefined,
      };
    }
  }
}

export function timelineEventToHistoryRow(ev: { id: string; at: number; title: string; subtitle?: string }): ComplaintHistoryRow {
  return {
    id: ev.id,
    at: ev.at,
    dateLabel: formatComplaintAuditDateTime(new Date(ev.at).toISOString()),
    actor: COMPLAINT_TIMELINE_ACTOR,
    actionBold: ev.title,
    detail: ev.subtitle,
  };
}

export function mergeAndSortHistoryRows(rows: ComplaintHistoryRow[]): ComplaintHistoryRow[] {
  return [...rows].sort((a, b) => {
    if (b.at !== a.at) return b.at - a.at;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Collapses chronologically consecutive rows that share `dedupeKey` when timestamps are
 * within `DEDUPE_HISTORY_WINDOW_MS` — keeps the **latest** event in each run (final state).
 */
export function dedupeComplaintHistoryRows(rows: ComplaintHistoryRow[]): ComplaintHistoryRow[] {
  if (rows.length <= 1) return rows;
  const asc = [...rows].sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    return String(a.id).localeCompare(String(b.id));
  });
  const out: ComplaintHistoryRow[] = [];
  for (const row of asc) {
    const key = row.dedupeKey;
    if (!key) {
      out.push(row);
      continue;
    }
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.dedupeKey === key &&
      row.at - prev.at >= 0 &&
      row.at - prev.at <= DEDUPE_HISTORY_WINDOW_MS
    ) {
      out[out.length - 1] = row;
    } else {
      out.push(row);
    }
  }
  return mergeAndSortHistoryRows(out);
}
