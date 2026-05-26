import type { StockDocumentItemRead } from "../../api/stockDocumentsApi";
import type { ReceivingScanResolve } from "../../api/wmsReceivingApi";
import type { WarehouseLocationItem } from "../../api/warehouseGraphApi";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";

export const PUTAWAY_FLOAT_EPS = 1e-5;

export function toCountValue(received: number | string | null | undefined): number {
  return Math.max(0, Math.round(Number(received) || 0));
}

export function isGhostReceivingLine(it: StockDocumentItemRead): boolean {
  if (toCountValue(it.received_quantity) !== 0) return false;
  if (Math.abs(Number(it.ordered_quantity) || 0) > PUTAWAY_FLOAT_EPS) return false;
  if ((it.batch_number || "").trim() !== "") return false;
  if (it.expiry_date != null && String(it.expiry_date).trim() !== "") return false;
  return true;
}

export function lineHasReceived(it: StockDocumentItemRead): boolean {
  return (Number(it.received_quantity) || 0) > PUTAWAY_FLOAT_EPS;
}

export function putawayRemaining(it: StockDocumentItemRead): number {
  const rec = Number(it.received_quantity) || 0;
  const put = Number(it.quantity_putaway) || 0;
  return Math.max(0, rec - put);
}

export function putawayDone(it: StockDocumentItemRead): boolean {
  return putawayRemaining(it) <= PUTAWAY_FLOAT_EPS;
}

export function sortPutawayLines(items: StockDocumentItemRead[]): StockDocumentItemRead[] {
  return [...items].sort((a, b) => {
    const ca = putawayDone(a);
    const cb = putawayDone(b);
    if (ca !== cb) return ca ? 1 : -1;
    const ta = a.putaway_updated_at ? new Date(a.putaway_updated_at).getTime() : 0;
    const tb = b.putaway_updated_at ? new Date(b.putaway_updated_at).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return a.id - b.id;
  });
}

export type PutawayQtyState = {
  cartonsCount: number;
  unitsCount: number;
  unitsPerCarton: number;
  inputMode: "carton" | "unit" | null;
  draft: string | null;
};

export const EMPTY_PUTAWAY_QTY: PutawayQtyState = {
  cartonsCount: 0,
  unitsCount: 0,
  unitsPerCarton: 1,
  inputMode: null,
  draft: null,
};

export function parsedUInt(text: string): number {
  const t = text.trim();
  if (t === "") return 0;
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function putawayTotalQty(m: PutawayQtyState): number {
  return m.cartonsCount * m.unitsPerCarton + m.unitsCount;
}

export function commitPutawayQtyInput(m: PutawayQtyState): PutawayQtyState {
  if (m.draft === null) return m;
  const mode = m.inputMode ?? "unit";
  const raw = m.draft !== "" ? m.draft : String(mode === "carton" ? m.cartonsCount : m.unitsCount);
  const v = parsedUInt(raw);
  if (mode === "carton") {
    return { ...m, draft: null, cartonsCount: v };
  }
  return { ...m, draft: null, unitsCount: v };
}

export function scanIsCarton(res: ReceivingScanResolve): boolean {
  if (res.match_kind === "bulk_ean") return true;
  if (res.match_kind === "product_barcode") {
    const dq = Math.max(1, Math.floor(Number(res.default_quantity) || 1));
    return dq > 1;
  }
  return false;
}

export function placeInputCaretAtEnd(el: HTMLInputElement | null) {
  if (!el) return;
  window.requestAnimationFrame(() => {
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* ignore */
    }
  });
}

export function storageTypeForLocationLabel(locs: WarehouseLocationItem[], label: string): unknown {
  const raw = label.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  const compact = normalizeScanEan(raw);
  for (const l of locs) {
    if (String(l.id) === raw && l.storage_type) return l.storage_type;
    const name = (l.name || "").trim();
    const code = (l.code ?? name).trim();
    if (!code) continue;
    if (name.toLowerCase() === lower || code.toLowerCase() === lower) return l.storage_type;
    const nc = normalizeScanEan(name);
    if (compact && nc && nc === compact) return l.storage_type;
  }
  return undefined;
}

/** Usuwa prefiks LOC- / LOC_ ze skanu lokalizacji. */
export function normalizeLocationScanCode(raw: string): string {
  let s = String(raw ?? "").trim();
  const up = s.toUpperCase();
  if (up.startsWith("LOC-") || up.startsWith("LOC_")) {
    s = s.slice(4);
  }
  return normalizeScanEan(s);
}

export function findLocationByScan(raw: string, locs: WarehouseLocationItem[]): WarehouseLocationItem | null {
  const c = normalizeLocationScanCode(raw);
  if (!c) return null;
  const lower = c.toLowerCase();
  for (const l of locs) {
    if (String(l.id) === c) return l;
    const nameCompact = normalizeLocationScanCode(l.name);
    if (nameCompact && nameCompact.toLowerCase() === lower) return l;
    const code = (l.code ?? l.name ?? "").trim();
    if (code) {
      const codeCompact = normalizeLocationScanCode(code);
      if (codeCompact && codeCompact.toLowerCase() === lower) return l;
    }
  }
  return null;
}

export function pickPutawayScanLine(
  items: StockDocumentItemRead[],
  productId: number,
  touched: Record<number, number>,
  carrierId?: number | null,
): StockDocumentItemRead | undefined {
  let c = items.filter((it) => it.product_id != null && it.product_id === productId && !putawayDone(it));
  if (carrierId != null && carrierId > 0) {
    c = c.filter((it) => Number(it.warehouse_carrier_id) === carrierId);
  }
  if (c.length === 0) return undefined;
  return c.reduce((best, it) => {
    const tb = touched[it.id] ?? 0;
    const bb = touched[best.id] ?? 0;
    if (tb > bb) return it;
    if (tb < bb) return best;
    return it.id < best.id ? it : best;
  });
}

export type PutawaySelectedLocation = {
  locationId: number;
  code: string;
  locationType: string;
  storageType?: unknown;
};
