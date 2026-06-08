/**
 * Inwentaryzacja — mapowanie zdarzeń audytu na czytelne wpisy osi czasu ERP/WMS.
 * Nigdy nie pokazuj surowych kluczy backendu ani JSON w UI.
 */

import type { InventoryAuditEventRead, InventoryDocumentTimelines } from "@/api/inventoryCountApi";
import { inventoryDocumentStatusLabel, inventoryMovementPolicyLabel } from "./inventoryCountUiLabels";

/** Kanoniczne akcje audytu z backendu → polskie etykiety operacyjne. */
export const INVENTORY_AUDIT_EVENT_LABELS: Record<string, string> = {
  "document.created": "Utworzono dokument inwentaryzacji",
  "document.status_changed": "Zmieniono status dokumentu",
  "snapshot.created": "Utworzono migawkę stanów magazynowych",
  "tasks.generated": "Wygenerowano zadania liczenia WMS",
  "count.scan": "Policzono produkt",
  "count.quantity_changed": "Zmieniono ilość",
  "line.confirmed": "Potwierdzono pozycję",
  "session.opened": "Otwarto sesję liczenia",
  "session.closed": "Zamknięto sesję liczenia",
  "report.exported": "Wyeksportowano raport",
  "audit_package.generated": "Wygenerowano pakiet audytowy",
  "document.submitted_for_approval": "Wysłano dokument do zatwierdzenia",
  "document.approved": "Zatwierdzono dokument",
  "document.rejected": "Odrzucono dokument",
  "document.posted": "Zaksięgowano korekty magazynowe",
  "line.recount_requested": "Zlecono ponowne liczenie",
  "recount.completed": "Zakończono ponowne liczenie",
  "location.locked": "Zablokowano lokalizację",
  "location.unlocked": "Odblokowano lokalizację",
  "adjustment.generated": "Wygenerowano korekty magazynowe",
};

const REPORT_FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF",
  xlsx: "XLSX",
};

const REPORT_KIND_SHORT: Record<string, string> = {
  counting_sheet: "spisu z natury",
  differences: "różnic",
  missing_stock: "braków",
  excess_stock: "nadwyżek",
  adjustments: "korekt magazynowych",
  user_activity: "aktywności operatorów",
  empty_locations: "pustych lokalizacji",
  problematic_locations: "problematycznych lokalizacji",
  valuation: "wyceny inwentaryzacji",
  opening_balance: "bilansu otwarcia",
  closing_balance: "bilansu zamknięcia",
  recount: "ponownych liczeń",
  product_discrepancy: "rozbieżności produktów",
  serial_mismatch: "niezgodności numerów seryjnych",
  lot_mismatch: "niezgodności partii",
};

export type InventoryAuditTimelineEntry = {
  id: string;
  sortKey: string;
  timestamp: string | null;
  userName: string;
  title: string;
  productName?: string | null;
  productEan?: string | null;
  productImageUrl?: string | null;
  locationCode?: string | null;
  qtyDelta?: string | null;
  qtyRange?: string | null;
  note?: string | null;
};

export function inventoryAuditEventLabel(action: unknown): string {
  const key = String(action ?? "").trim();
  if (!key) return "Zdarzenie operacyjne";
  return INVENTORY_AUDIT_EVENT_LABELS[key] ?? "Zdarzenie operacyjne";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function formatQty(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatInventoryQtyDelta(delta: number): string {
  if (Math.abs(delta) < 1e-9) return "0 szt.";
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatQty(Math.abs(delta))} szt.`;
}

function formatQtyRange(from: number | null, to: number | null): string | null {
  if (from == null && to == null) return null;
  if (from != null && to != null) return `${formatQty(from)} → ${formatQty(to)} szt.`;
  if (to != null) return `${formatQty(to)} szt.`;
  return `${formatQty(from!)} szt.`;
}

function operatorLabel(name?: string | null, userId?: number | null): string {
  const trimmed = String(name ?? "").trim();
  if (trimmed) return trimmed;
  if (userId != null) return `Operator #${userId}`;
  return "System";
}

function reportExportTitle(detail: Record<string, unknown> | null): string {
  const kind = String(detail?.report_kind ?? "").trim();
  const format = String(detail?.format ?? "").trim().toLowerCase();
  const shortName = REPORT_KIND_SHORT[kind] ?? "inwentaryzacji";
  const fmt = REPORT_FORMAT_LABELS[format] ?? (format ? format.toUpperCase() : "");
  if (fmt) return `Wyeksportowano raport ${shortName} ${fmt}`;
  return inventoryAuditEventLabel("report.exported");
}

function statusChangeNote(detail: Record<string, unknown> | null): string | null {
  const from = detail?.from;
  const to = detail?.to;
  if (from == null && to == null) return null;
  const fromLabel = inventoryDocumentStatusLabel(from);
  const toLabel = inventoryDocumentStatusLabel(to);
  return `${fromLabel} → ${toLabel}`;
}

function approvalNotesLookup(
  timelines: InventoryDocumentTimelines | null,
  auditAction: string,
  userId: number | null | undefined,
  createdAt: string | null | undefined,
): string | null {
  if (!timelines?.approval_timeline?.length) return null;
  const actionMap: Record<string, string> = {
    "document.submitted_for_approval": "submit",
    "document.approved": "approve",
    "document.rejected": "reject",
  };
  const approvalAction = actionMap[auditAction];
  if (!approvalAction) return null;
  const targetMs = createdAt ? Date.parse(createdAt) : NaN;
  for (const row of timelines.approval_timeline) {
    if (row.action !== approvalAction) continue;
    if (userId != null && row.user_id != null && row.user_id !== userId) continue;
    if (Number.isFinite(targetMs) && row.created_at) {
      const diff = Math.abs(Date.parse(row.created_at) - targetMs);
      if (diff > 120_000) continue;
    }
    const notes = String(row.notes ?? "").trim();
    if (notes) return notes;
  }
  return null;
}

function qtyDeltaFromStates(
  prev: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
  detail: Record<string, unknown> | null,
): { delta: number | null; from: number | null; to: number | null } {
  const from =
    asNumber(detail?.from) ??
    asNumber(prev?.counted_quantity) ??
    asNumber(prev?.quantity);
  const to =
    asNumber(detail?.to) ??
    asNumber(next?.counted_quantity) ??
    asNumber(next?.quantity) ??
    asNumber(detail?.quantity);
  if (from != null && to != null) return { delta: to - from, from, to };
  if (to != null && from == null) return { delta: to, from: 0, to };
  return { delta: null, from, to };
}

function shouldSkipPairedQtyChange(current: InventoryAuditEventRead, previous: InventoryAuditEventRead | null): boolean {
  if (current.action !== "count.quantity_changed") return false;
  if (!previous || previous.action !== "count.scan") return false;
  if (current.inventory_document_line_id == null || previous.inventory_document_line_id == null) return false;
  if (current.inventory_document_line_id !== previous.inventory_document_line_id) return false;
  if (current.user_id != null && previous.user_id != null && current.user_id !== previous.user_id) return false;
  const a = current.created_at ? Date.parse(current.created_at) : NaN;
  const b = previous.created_at ? Date.parse(previous.created_at) : NaN;
  if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 5000) return true;
  return current.id === previous.id + 1;
}

function formatAuditEvent(
  ev: InventoryAuditEventRead,
  timelines: InventoryDocumentTimelines | null,
): InventoryAuditTimelineEntry {
  const detail = asRecord(ev.detail);
  const prev = asRecord(ev.previous_state);
  const next = asRecord(ev.next_state);
  const ctx = ev.line_context;

  let title = inventoryAuditEventLabel(ev.action);
  let note: string | null = null;
  let qtyDelta: string | null = null;
  let qtyRange: string | null = null;

  switch (ev.action) {
    case "report.exported":
      title = reportExportTitle(detail);
      if (detail?.rows != null) {
        note = `${detail.rows} wierszy`;
      }
      break;
    case "document.status_changed":
      note = statusChangeNote(detail);
      break;
    case "document.created":
      if (detail?.number) note = `Numer: ${detail.number}`;
      break;
    case "location.locked":
    case "location.unlocked": {
      const loc = ev.location_name ?? ctx?.location_name;
      if (loc) note = loc;
      if (ev.action === "location.locked") {
        const policy = detail?.movement_policy ?? detail?.lock_mode;
        const mode = policy ? inventoryMovementPolicyLabel(policy) : null;
        if (mode && mode !== "—") note = note ? `${note} (${mode})` : mode;
      }
      break;
    }
    case "count.scan":
    case "count.quantity_changed": {
      const { delta, from, to } = qtyDeltaFromStates(prev, next, detail);
      if (ev.action === "count.scan" && delta != null) {
        qtyDelta = formatInventoryQtyDelta(delta);
      } else if (ev.action === "count.quantity_changed") {
        qtyRange = formatQtyRange(from, to);
        if (delta != null && Math.abs(delta) >= 1e-9) qtyDelta = formatInventoryQtyDelta(delta);
      }
      break;
    }
    case "line.recount_requested":
      if (detail?.difference_percent != null) {
        note = `Różnica: ${Number(detail.difference_percent).toFixed(1)}%`;
      }
      break;
    case "recount.completed": {
      const { from, to } = qtyDeltaFromStates(prev, next, detail);
      qtyRange = formatQtyRange(from, to);
      break;
    }
    case "document.submitted_for_approval":
    case "document.approved":
    case "document.rejected":
      note = approvalNotesLookup(timelines, ev.action, ev.user_id, ev.created_at);
      break;
    case "tasks.generated":
      if (detail?.task_count != null) note = `${detail.task_count} zadań`;
      break;
    case "audit_package.generated":
      if (Array.isArray(detail?.files)) note = `${detail.files.length} plików`;
      break;
    default:
      break;
  }

  return {
    id: `audit-${ev.id}`,
    sortKey: ev.created_at ?? `id-${ev.id}`,
    timestamp: ev.created_at,
    userName: operatorLabel(ev.user_name, ev.user_id),
    title,
    productName: ctx?.product_name ?? null,
    productEan: ctx?.ean ?? null,
    productImageUrl: ctx?.product_image_url ?? null,
    locationCode: ctx?.location_name ?? ev.location_name ?? null,
    qtyDelta,
    qtyRange,
    note,
  };
}

/** Buduje posortowaną oś czasu operacyjną bez surowych kluczy backendu. */
export function buildInventoryAuditTimeline(
  auditLog: InventoryAuditEventRead[],
  timelines: InventoryDocumentTimelines | null,
): InventoryAuditTimelineEntry[] {
  const sorted = [...auditLog].sort((a, b) => a.id - b.id);
  const entries: InventoryAuditTimelineEntry[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const ev = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    if (prev && shouldSkipPairedQtyChange(ev, prev)) continue;
    entries.push(formatAuditEvent(ev, timelines));
  }

  return entries.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
}

export { formatTimestamp as formatInventoryAuditTimestamp };
