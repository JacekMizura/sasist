import type { ComplaintLineDetail, ComplaintStructuredEvent } from "../../types/complaint";
import { COMPLAINT_STATUS_LABELS_PL, type ComplaintStatusCode } from "../../types/complaint";
import {
  COMPLAINT_TIMELINE_ACTOR,
  type ComplaintHistoryRow,
  complaintLineUpdateDedupeKey,
  formatComplaintAuditDateTime,
  humanizeLineUpdate,
  lineJournalRef,
  settlementTypePl,
} from "./complaintAuditHumanize";

function parseTs(iso: string | null | undefined): number {
  if (!iso?.trim()) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function statusPl(code: string | null | undefined): string {
  const u = String(code ?? "").trim().toUpperCase();
  if (u in COMPLAINT_STATUS_LABELS_PL) return COMPLAINT_STATUS_LABELS_PL[u as ComplaintStatusCode];
  return code?.trim() || "—";
}

/** Magazynowy etap pozycji (klucz storage / akcja) → tekst PL */
const LINE_STAGE_PL: Record<string, string> = {
  CUSTOMER_PICKUP: "Zamówiono odbiór od klienta",
  PICKUP: "Odbiór",
  WAREHOUSE_RECEIVED: "Przyjęto na magazyn",
  RECEIVED: "Przyjęto na magazyn",
  WAREHOUSE_IN: "Przyjęto na magazyn",
  SENT_TO_SERVICE: "Wysłano do serwisu",
  SERVICE_SENT: "Wysłano do serwisu",
  REPAIR_COMPLETED: "Naprawa zakończona",
  REPAIR_DONE: "Naprawa zakończona",
  SHIPPED_TO_CUSTOMER: "Wysłano do klienta",
  SHIPPED_CUSTOMER: "Wysłano do klienta",
  EXCHANGE_ORDER_PLACED: "Złożono zamówienie wymiany",
  ORDER_PLACED: "Złożono zamówienie wymiany",
  OUTBOUND_SHIPPED: "Wysłano przesyłkę wychodzącą",
  SHIP_OUT: "Wysłano przesyłkę wychodzącą",
  RETURNED_TO_CUSTOMER: "Zwrócono towar do klienta",
  RETURN_CUSTOMER: "Zwrócono towar do klienta",
  REFUND_COMPLETED: "Zakończono zwrot środków",
  REFUND_DONE: "Zakończono zwrot środków",
};

function lineStagePl(code: string | null | undefined): string {
  if (code == null || !String(code).trim()) return "—";
  const u = String(code).trim().toUpperCase();
  return LINE_STAGE_PL[u] ?? u.replace(/_/g, " ").toLowerCase();
}

function shipmentStatusMessage(status: string, payload: Record<string, unknown>): string {
  const st = String(status).trim().toUpperCase();
  const role = String(payload.role ?? "").trim().toUpperCase();
  const bt = String(payload.business_type ?? "").trim().toUpperCase();

  if (st === "ORDERED") {
    if (role === "SERVICE") return "Nadano przesyłkę — wysłano do serwisu / dostawcy";
    if (role === "OUTBOUND")
      return bt === "EXCHANGE"
        ? "Zamówiono kuriera — dostawa wymiany + odbiór reklamowanego towaru"
        : "Zamówiono kuriera — dostawa nowego towaru";
    return "Zamówiono odbiór kuriera";
  }
  if (st === "PICKED_UP") {
    if (role === "SERVICE") return "Odebrano przez kuriera";
    if (role === "OUTBOUND")
      return bt === "EXCHANGE"
        ? "Kurier odebrał przesyłkę (wymiana + zwrot od klienta)"
        : "Kurier nadał przesyłkę do klienta";
    return "Przesyłka odebrana przez kuriera";
  }
  if (st === "IN_TRANSIT") {
    if (role === "SERVICE") return "W transporcie do miejsca docelowego";
    return "W drodze";
  }
  if (st === "OUT_FOR_DELIVERY") return "W doręczeniu";
  if (st === "DELIVERED") {
    if (role === "SERVICE") return "Dostarczona do serwisu / dostawcy";
    if (role === "OUTBOUND")
      return bt === "EXCHANGE"
        ? "Dostarczono wymianę do klienta; odebrano towar reklamacyjny"
        : "Dostarczono nowe zamówienie do klienta";
    return "Dostarczona";
  }
  if (st === "IN_SERVICE") return "Produkt w obsłudze u odbiorcy";
  if (st === "RETURNING") return "W drodze powrotnej do magazynu";
  if (st === "RETURNED") return "Zwrot dostarczony do magazynu";
  if (st === "CANCELLED") return "Anulowana";
  return "Przesyłka";
}

function shipmentRoleLabel(role: string | undefined): string | undefined {
  const r = String(role ?? "").trim().toUpperCase();
  if (r === "CUSTOMER") return "Zwrot od klienta";
  if (r === "SERVICE") return "Nadanie do serwisu";
  if (r === "OUTBOUND") return "Przesyłka wychodząca";
  return undefined;
}

/** Compact context for journal: „Przewoźnik, nr: …”, optionally typ przesyłki. */
function detailLinesForShipment(payload: Record<string, unknown>): string | undefined {
  const carrier = payload.carrier != null ? String(payload.carrier).trim() : "";
  const tn = payload.tracking_number != null ? String(payload.tracking_number).trim() : "";
  const role = shipmentRoleLabel(String(payload.role ?? ""));
  const bits: string[] = [];
  if (carrier) bits.push(carrier);
  if (tn) bits.push(`nr: ${tn}`);
  if (role) bits.push(role);
  return bits.length ? bits.join(", ") : undefined;
}

/**
 * Maps structured `complaint_events` (full audit journal) — no raw API strings in UI.
 */
export function humanizeComplaintStructuredEvent(
  e: ComplaintStructuredEvent,
  index: number,
  lines: ComplaintLineDetail[],
): ComplaintHistoryRow {
  const at = parseTs(e.created_at);
  const dateLabel = formatComplaintAuditDateTime(e.created_at);
  const id = `cev-${e.id}-${index}`;
  const p = e.payload && typeof e.payload === "object" ? (e.payload as Record<string, unknown>) : {};
  const actor = (e.actor ?? COMPLAINT_TIMELINE_ACTOR).trim() || COMPLAINT_TIMELINE_ACTOR;
  const lineId = e.line_id != null ? Number(e.line_id) : NaN;
  const lineHint = Number.isFinite(lineId) ? lineJournalRef(lines, lineId) : "";

  switch (e.event_type) {
    case "COMPLAINT_PROCESS_STATUS":
    case "COMPLAINT_STATUS_CHANGED": {
      const hasPair = p.from != null || p.to != null;
      if (hasPair) {
        const fromL = p.from != null && String(p.from).trim() !== "" ? statusPl(String(p.from)) : "—";
        const toL = p.to != null && String(p.to).trim() !== "" ? statusPl(String(p.to)) : "—";
        return {
          id,
          at,
          dateLabel,
          actor,
          actionBold: toL,
          detail: fromL !== "—" ? fromL : undefined,
          dedupeKey: `complaint:status:${String(p.to ?? "").toUpperCase()}`,
        };
      }
      const st = String(p.status ?? "").trim().toUpperCase();
      const toOnly = st || String(p.to ?? "").trim().toUpperCase();
      const isTerminal = toOnly && ["ZAAKCEPTOWANA", "ODRZUCONA"].includes(toOnly);
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: isTerminal ? "Zamknięto reklamację" : statusPl(toOnly || st),
        detail: undefined,
        dedupeKey: `complaint:status:${toOnly || st}`,
      };
    }
    case "LINE_PROCESS_STATUS":
    case "OPERATION_STEP_DONE": {
      const hasPair = p.from != null || p.to != null;
      if (hasPair) {
        const fromL = lineStagePl(p.from != null ? String(p.from) : null);
        const toL = lineStagePl(p.to != null ? String(p.to) : null);
        const toRaw = String(p.to ?? "").trim().toUpperCase();
        return {
          id,
          at,
          dateLabel,
          actor,
          actionBold: toL,
          detail: [fromL !== "—" ? fromL : null, lineHint || null].filter(Boolean).join(" — ") || undefined,
          dedupeKey:
            Number.isFinite(lineId) && toRaw
              ? `line:${lineId}:opst:${toRaw}`
              : undefined,
        };
      }
      const st = String(p.status ?? p.action ?? "").trim().toUpperCase();
      const msg = LINE_STAGE_PL[st] ?? st.replace(/_/g, " ").toLowerCase();
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: msg,
        detail: lineHint || undefined,
        dedupeKey: Number.isFinite(lineId) && st ? `line:${lineId}:opst:${st}` : undefined,
      };
    }
    case "SHIPMENT_STATUS":
    case "SHIPMENT_CREATED": {
      const fromRaw = p.from != null ? String(p.from).trim() : "";
      const toRaw = p.to != null ? String(p.to).trim() : "";
      if (fromRaw || toRaw) {
        const fromL = fromRaw ? shipmentStatusMessage(fromRaw, p) : "—";
        const toL = toRaw ? shipmentStatusMessage(toRaw, p) : "—";
        return {
          id,
          at,
          dateLabel,
          actor,
          actionBold: toL,
          detail: [fromL !== "—" ? fromL : null, detailLinesForShipment(p) ?? null]
            .filter(Boolean)
            .join(" — ") || undefined,
          dedupeKey: toRaw
            ? `sh:${String(p.role ?? "")}:${String(p.tracking_number ?? "").slice(0, 64)}:st:${toRaw}`
            : undefined,
        };
      }
      const st = String(p.status ?? "ORDERED").trim().toUpperCase();
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: shipmentStatusMessage(st, p),
        detail: detailLinesForShipment(p),
      };
    }
    case "COMPLAINT_CREATED":
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: "Utworzono reklamację",
        detail: undefined,
      };
    case "COMPLAINT_AUTO_ACCEPTED_LAW":
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: "Reklamacja uznana z mocy prawa",
        detail: "Termin 14 dni na odpowiedź",
      };
    case "DEFECT_TAGS_UPDATED":
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: "Tagi wad",
        detail: undefined,
      };
    case "RESOLUTION_SET": {
      const rt = String(p.resolution_type ?? "").trim().toUpperCase();
      const label =
        rt === "REPLACEMENT"
          ? "Wymiana"
          : rt === "REFUND"
            ? "Pełny zwrot"
            : rt === "PARTIAL_REFUND"
              ? "Częściowy zwrot"
              : rt === "REJECTION"
                ? "Odmowa"
                : rt;
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: label || "Rozliczenie",
        detail: undefined,
      };
    }
    case "REFUND_CREATED": {
      const amt = p.amount;
      const cur = p.currency;
      const d =
        typeof amt === "number" && Number.isFinite(amt)
          ? `${amt.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${String(cur ?? "").trim() || "PLN"}`
          : undefined;
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: d ?? "Kwota zwrotu",
        detail: undefined,
      };
    }
    case "REPLACEMENT_ORDER_CREATED":
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: "Zamówienie wymiany",
        detail: undefined,
      };
    case "LINE_UPDATED": {
      const hm = humanizeLineUpdate(p, lines);
      const lid = e.line_id != null ? Number(e.line_id) : NaN;
      const dedupeKey =
        Number.isFinite(lid) && p && typeof p === "object" ? complaintLineUpdateDedupeKey(p, lid) : undefined;
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: hm.actionBold,
        detail: hm.detail,
        dedupeKey,
      };
    }
    case "SETTLEMENT_SAVED": {
      const st = settlementTypePl(String(p.settlement_type ?? ""));
      const amt = p.amount;
      const cur = String(p.currency ?? "").trim() || "PLN";
      const amtStr =
        typeof amt === "number" && Number.isFinite(amt)
          ? `${amt.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
          : undefined;
      const detailParts = [amtStr, lineHint].filter(Boolean);
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: st,
        detail: detailParts.join(" — ") || undefined,
        dedupeKey: Number.isFinite(lineId)
          ? `line:${lineId}:settle:${String(p.settlement_type ?? "")}`
          : undefined,
      };
    }
    case "PHOTO_ADDED":
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: "Dodano zdjęcia",
        detail: lineHint || undefined,
      };
    case "DOCUMENT_GENERATED":
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: "Wygenerowano dokument PDF",
        detail: undefined,
      };
    case "DOCUMENTS_REGENERATED":
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: "Ponownie wygenerowano dokumenty",
        detail: undefined,
      };
    case "WMS_INSPECTION_SAVED":
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: "Zapisano dane z inspekcji WMS",
        detail: undefined,
      };
    case "LEGACY_AUDIT":
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: "Zdarzenie historyczne (import)",
        detail: undefined,
      };
    default:
      return {
        id,
        at,
        dateLabel,
        actor,
        actionBold: "Zdarzenie w systemie",
        detail: undefined,
      };
  }
}

export function buildStructuredTimelineRows(
  events: ComplaintStructuredEvent[] | undefined,
  lines: ComplaintLineDetail[],
): ComplaintHistoryRow[] {
  const list = (events ?? []).filter((e) => e.event_type !== "COMPLAINT_DECISION_FLAGS_UPDATED");
  return list.map((e, i) => humanizeComplaintStructuredEvent(e, i, lines));
}
