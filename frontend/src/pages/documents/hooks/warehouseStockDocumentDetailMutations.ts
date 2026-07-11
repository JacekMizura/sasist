import type { StockDocumentRead } from "../../../api/stockDocumentsApi";
import { scanWmsCarrierByBarcode } from "../../../api/wmsCarrierApi";
import { normalizeWarehouseDocType } from "../warehouseDocumentsUi";
import { parseQty } from "./warehouseStockDocumentDetailComputed";

export type PatchLineItem = { id: number; received_quantity: number };

export type PatchItemsResult =
  | { ok: true; items: PatchLineItem[] }
  | { ok: false; msg: string };

export type EnrichedLineItem = PatchLineItem & { suggested_warehouse_carrier_id?: number | null };

export function apiErrorMessage(e: unknown, fallback: string): string {
  const msg =
    e && typeof e === "object" && "response" in e
      ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
      : null;
  return msg != null ? String(msg) : fallback;
}

export function syncLineStateFromDocument(detail: StockDocumentRead): {
  receivedByLineId: Record<number, string>;
  suggestedCarrierBarcodeByLineId: Record<number, string>;
} {
  const receivedByLineId: Record<number, string> = {};
  const suggestedCarrierBarcodeByLineId: Record<number, string> = {};
  for (const it of detail.items) {
    receivedByLineId[it.id] = String(it.received_quantity);
    suggestedCarrierBarcodeByLineId[it.id] = (it.suggested_warehouse_carrier_barcode || "").trim();
  }
  return { receivedByLineId, suggestedCarrierBarcodeByLineId };
}

export function buildPatchItems(
  detail: StockDocumentRead,
  receivedByLineId: Record<number, string>,
): PatchItemsResult {
  const items: PatchLineItem[] = [];
  for (const it of detail.items) {
    const raw = receivedByLineId[it.id];
    if (raw === undefined) {
      return { ok: false, msg: "Uzupełnij ilości przyjęte dla wszystkich pozycji." };
    }
    const q = parseQty(raw);
    if (q === null) return { ok: false, msg: `Niepoprawna liczba dla pozycji #${it.id}.` };
    if (q < 0) return { ok: false, msg: "Ilość przyjęta nie może być ujemna." };
    items.push({ id: it.id, received_quantity: q });
  }
  return { ok: true, items };
}

export function shouldApplyCarrierColumn(detail: StockDocumentRead): boolean {
  return (
    detail.status === "draft" &&
    normalizeWarehouseDocType(detail.document_type) === "PZ" &&
    (detail.edit_mode ?? "none") === "full"
  );
}

export async function enrichLineItemsWithCarriers(
  tenantId: number,
  items: PatchLineItem[],
  suggestedCarrierBarcodeByLineId: Record<number, string>,
): Promise<{ ok: true; items: EnrichedLineItem[] } | { ok: false; msg: string }> {
  const enriched: EnrichedLineItem[] = [];
  for (const row of items) {
    const bc = (suggestedCarrierBarcodeByLineId[row.id] ?? "").trim();
    if (!bc) {
      enriched.push({ ...row, suggested_warehouse_carrier_id: null });
      continue;
    }
    try {
      const sc = await scanWmsCarrierByBarcode(tenantId, bc);
      if (!sc.found || !sc.carrier) {
        return { ok: false, msg: `Nie znaleziono nośnika o kodzie: ${bc}` };
      }
      enriched.push({ ...row, suggested_warehouse_carrier_id: sc.carrier.id });
    } catch {
      return { ok: false, msg: `Błąd weryfikacji nośnika: ${bc}` };
    }
  }
  return { ok: true, items: enriched };
}

export function parseOptionalMoney(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function receiveAllQuantities(detail: StockDocumentRead): Record<number, string> {
  const next: Record<number, string> = {};
  for (const it of detail.items) {
    next[it.id] = String(it.ordered_quantity);
  }
  return next;
}
