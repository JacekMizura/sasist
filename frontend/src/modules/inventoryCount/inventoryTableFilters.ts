import type { InventoryDocumentRead, InventoryLineRead } from "@/api/inventoryCountApi";
import type { InventoryAuditTimelineEntry } from "../inventoryAuditEventLabels";

export type InventoryTableFilters = {
  query: string;
  operator: string;
  dateFrom: string;
  dateTo: string;
  differencesOnly: boolean;
  recountOnly: boolean;
  unknownOnly: boolean;
};

export const EMPTY_TABLE_FILTERS: InventoryTableFilters = {
  query: "",
  operator: "",
  dateFrom: "",
  dateTo: "",
  differencesOnly: false,
  recountOnly: false,
  unknownOnly: false,
};

const FILTER_STORAGE_PREFIX = "inv-doc-filters-";

export function loadPersistedTableFilters(documentId: number): InventoryTableFilters {
  try {
    const raw = sessionStorage.getItem(`${FILTER_STORAGE_PREFIX}${documentId}`);
    if (!raw) return EMPTY_TABLE_FILTERS;
    const parsed = JSON.parse(raw) as Partial<InventoryTableFilters>;
    return { ...EMPTY_TABLE_FILTERS, ...parsed };
  } catch {
    return EMPTY_TABLE_FILTERS;
  }
}

export function persistTableFilters(documentId: number, filters: InventoryTableFilters): void {
  try {
    sessionStorage.setItem(`${FILTER_STORAGE_PREFIX}${documentId}`, JSON.stringify(filters));
  } catch {
    /* quota / private mode */
  }
}

function haystackLine(line: InventoryLineRead): string {
  return [
    line.product_name,
    line.sku,
    line.ean,
    line.location_name,
    line.last_counted_by_name,
    line.carrier_code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function inDateRange(iso: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  if (from) {
    const f = Date.parse(from);
    if (Number.isFinite(f) && t < f) return false;
  }
  if (to) {
    const end = Date.parse(to);
    if (Number.isFinite(end) && t > end + 86_400_000) return false;
  }
  return true;
}

export function filterInventoryLines(
  lines: InventoryLineRead[],
  filters: InventoryTableFilters,
): InventoryLineRead[] {
  const q = filters.query.trim().toLowerCase();
  const op = filters.operator.trim().toLowerCase();

  return lines.filter((line) => {
    if (filters.differencesOnly) {
      const diff = line.difference_quantity;
      if (diff == null || Math.abs(diff) < 1e-9) return false;
    }
    if (filters.recountOnly) {
      const rs = String(line.recount_state ?? "").toLowerCase();
      if (rs !== "required" && rs !== "resolved" && line.status !== "recount") return false;
    }
    if (filters.unknownOnly) {
      if (line.status !== "open" || (line.expected_quantity != null && line.expected_quantity > 0)) return false;
    }
    if (op && !(line.last_counted_by_name ?? "").toLowerCase().includes(op)) return false;
    if (!inDateRange(line.last_counted_at, filters.dateFrom, filters.dateTo)) return false;
    if (q && !haystackLine(line).includes(q)) return false;
    return true;
  });
}

export function filterAuditTimeline(
  entries: InventoryAuditTimelineEntry[],
  filters: InventoryTableFilters,
): InventoryAuditTimelineEntry[] {
  const q = filters.query.trim().toLowerCase();
  const op = filters.operator.trim().toLowerCase();

  return entries.filter((row) => {
    if (op && !(row.userName ?? "").toLowerCase().includes(op)) return false;
    if (!inDateRange(row.timestamp, filters.dateFrom, filters.dateTo)) return false;
    if (q) {
      const hay = [row.title, row.note, row.productName, row.productEan, row.locationCode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function canSubmitFromDoc(doc: InventoryDocumentRead | null | undefined): boolean {
  if (!doc || doc.status !== "in_progress") return false;
  if (doc.submit_readiness) return doc.submit_readiness.can_submit;
  return doc.counted_lines > 0;
}
