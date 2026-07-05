import type { StockDocumentListRow, StockDocumentRead } from "@/api/stockDocumentsApi";
import { documentCreatedByLabel } from "@/utils/documentCreatedBy";
import { displayWarehouseDocumentNumber } from "@/utils/warehouseDocumentNumberDisplay";
import type { WarehouseDocType } from "./warehouseDocumentConfigs";

export type DocumentSeriesBrief = {
  id?: string | null;
  code: string;
  name?: string | null;
  prefix?: string | null;
};

export function seriesCode(row: {
  series?: DocumentSeriesBrief | null;
  document_series_prefix?: string | null;
  document_type?: string;
}): string {
  const fromObj = (row.series?.code || row.series?.prefix || "").trim();
  if (fromObj) return fromObj;
  const prefix = (row.document_series_prefix || "").trim();
  if (prefix) return prefix;
  return (row.document_type || "").trim().toUpperCase() || "—";
}

export function documentDisplayNumber(row: { document_number?: string | null; id: number }): string {
  const raw = (row.document_number || "").trim();
  if (raw) return displayWarehouseDocumentNumber(raw);
  return `#${row.id}`;
}

export function totalQuantity(row: StockDocumentListRow): number {
  const rec = Number(row.total_received) || 0;
  const ord = Number(row.total_ordered) || 0;
  return rec > 1e-9 ? rec : ord;
}

const CREATION_SOURCE_LABELS: Record<string, string> = {
  INVENTORY_COUNT: "Inwentaryzacja",
  PRODUCTION: "Produkcja",
  PANEL: "Korekta ręczna",
  WMS: "Operacja WMS",
  DIRECT_SALE: "Sprzedaż bezpośrednia",
};

export function documentSourceLabel(
  row: Pick<StockDocumentListRow, "creation_source" | "production_order_number" | "delivery_id" | "supplier_name">,
): string {
  const src = String(row.creation_source || "PANEL").trim().toUpperCase();
  if (src === "PRODUCTION" && row.production_order_number) {
    return `Produkcja · ${row.production_order_number}`;
  }
  if (row.delivery_id != null && (row.supplier_name || "").trim()) {
    return `Dostawa · ${row.supplier_name.trim()}`;
  }
  return CREATION_SOURCE_LABELS[src] ?? src.replace(/_/g, " ").toLowerCase();
}

export function documentSourceLabelDetail(doc: StockDocumentRead): string {
  const src = String(doc.creation_source || "PANEL").trim().toUpperCase();
  if (src === "PRODUCTION") {
    if ((doc.production_batch_number || "").trim()) {
      return `Produkcja · partia ${doc.production_batch_number.trim()}`;
    }
    if ((doc.production_order_number || "").trim()) {
      return `Produkcja · ${doc.production_order_number.trim()}`;
    }
    return "Produkcja";
  }
  if (doc.production_order_number) {
    return `Produkcja · ${doc.production_order_number}`;
  }
  if (doc.production_batch_number) {
    return `Partia produkcyjna · ${doc.production_batch_number}`;
  }
  if (doc.delivery_id != null && (doc.supplier_name || "").trim()) {
    return `Dostawa · ${doc.supplier_name.trim()}`;
  }
  if (doc.linked_sale_document?.document_number) {
    return `Sprzedaż · ${doc.linked_sale_document.document_number}`;
  }
  return CREATION_SOURCE_LABELS[src] ?? "Operacja magazynowa";
}

export function putawayStatusLabel(status?: string | null): string {
  const s = String(status || "NOT_STARTED").trim().toUpperCase();
  if (s === "DONE") return "Zakończono";
  if (s === "IN_PROGRESS") return "W trakcie";
  return "Oczekuje";
}

export function operatorLabel(row: StockDocumentListRow): string {
  return documentCreatedByLabel(row.created_by) || "—";
}

export function listValueNet(row: StockDocumentListRow, docType: WarehouseDocType): number | null {
  const net = row.total_net;
  if (net == null || !Number.isFinite(Number(net))) return null;
  if (docType === "RW" || docType === "ZW") return Math.abs(Number(net));
  return Number(net);
}

export function listValueGross(row: StockDocumentListRow): number | null {
  const gross = row.total_gross;
  if (gross == null || !Number.isFinite(Number(gross))) return null;
  return Number(gross);
}

export function mmFromLabel(row: StockDocumentListRow): string {
  const wh = (row.source_warehouse_name || "").trim();
  if (wh) return wh;
  const name = (row.mm_from_location_name || "").trim();
  if (name) return name;
  const legacy = (row.warehouse_name || "").trim();
  if (legacy) return legacy;
  return row.source_warehouse_id != null
    ? `#${row.source_warehouse_id}`
    : row.warehouse_id != null
      ? `#${row.warehouse_id}`
      : "—";
}

export function mmToLabel(row: StockDocumentListRow): string {
  const wh = (row.destination_warehouse_name || "").trim();
  if (wh) return wh;
  const name = (row.mm_to_location_name || "").trim();
  if (name) return name;
  const loc = (row.location_name || "").trim();
  if (loc) return loc;
  return row.destination_warehouse_id != null
    ? `#${row.destination_warehouse_id}`
    : row.location_id != null
      ? `#${row.location_id}`
      : "—";
}

export function shouldShowSupplierCard(
  docType: WarehouseDocType,
  detail: Pick<StockDocumentRead, "supplier_id" | "supplier_name">,
): boolean {
  if (docType !== "PZ" && docType !== "ZD") return false;
  if (detail.supplier_id == null) return false;
  return Boolean((detail.supplier_name || "").trim());
}

export function shouldShowCustomerCard(docType: WarehouseDocType): boolean {
  return docType === "WZ";
}

export function shouldShowDocumentSourceCard(docType: WarehouseDocType): boolean {
  return docType === "RW" || docType === "PW" || docType === "ZW" || docType === "ZD";
}
