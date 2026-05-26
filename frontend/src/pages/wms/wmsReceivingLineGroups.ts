import type { StockDocumentItemRead } from "../../api/stockDocumentsApi";
import { formatExpiryDatePl } from "./putawayFormat";

const FLOAT_EPS = 1e-5;
const NO_EXPIRY_PREFIX = "9999";

export function toReceivingCountValue(received: number | string | null | undefined): number {
  return Math.max(0, Math.round(Number(received) || 0));
}

export function isGhostReceivingLine(it: StockDocumentItemRead): boolean {
  if (toReceivingCountValue(it.received_quantity) !== 0) return false;
  if (Math.abs(Number(it.ordered_quantity) || 0) > FLOAT_EPS) return false;
  return true;
}

export function isWmsExtraReceivingLine(it: StockDocumentItemRead): boolean {
  if (it.wms_extra_item === true) return true;
  if ((it.wms_line_status || "").toUpperCase() === "EXTRA_ITEM") return true;
  return (
    it.delivery_item_id == null &&
    Math.abs(Number(it.ordered_quantity) || 0) <= FLOAT_EPS
  );
}

export function normalizeReceivingExpiryKey(expiry: string | null | undefined): string {
  if (expiry == null) return "";
  const s = String(expiry).trim().slice(0, 10);
  if (!s || s.startsWith(NO_EXPIRY_PREFIX)) return "";
  return s;
}

export function receivingSerialKey(it: StockDocumentItemRead): string {
  const sns = it.serial_numbers ?? [];
  if (sns.length === 1) return (sns[0] ?? "").trim();
  if (sns.length > 1) return [...sns].map((s) => s.trim()).filter(Boolean).sort().join("|");
  return "";
}

export type ReceivingStockIdentity = {
  productId: number;
  batchNumber: string;
  expiryKey: string;
  serialKey: string;
  carrierId: number | null;
};

export function receivingStockIdentity(it: StockDocumentItemRead): ReceivingStockIdentity {
  return {
    productId: Number(it.product_id) || 0,
    batchNumber: (it.batch_number ?? "").trim(),
    expiryKey: normalizeReceivingExpiryKey(it.expiry_date),
    serialKey: receivingSerialKey(it),
    carrierId: it.warehouse_carrier_id ?? null,
  };
}

/** Merge quantity only when full WMS stock identity matches. */
export function isSameReceivingStock(
  a: StockDocumentItemRead,
  b: StockDocumentItemRead,
): boolean {
  const ia = receivingStockIdentity(a);
  const ib = receivingStockIdentity(b);
  if (ia.productId <= 0 || ia.productId !== ib.productId) return false;
  if (ia.batchNumber !== ib.batchNumber) return false;
  if (ia.expiryKey !== ib.expiryKey) return false;
  if (ia.carrierId !== ib.carrierId) return false;
  if (ia.serialKey || ib.serialKey) return ia.serialKey === ib.serialKey && ia.serialKey.length > 0;
  return true;
}

/** UI / aggregation key: one card per distinct lot × carrier × serial × disposition. */
export function receivingLineGroupKey(it: StockDocumentItemRead): string {
  const i = receivingStockIdentity(it);
  const sn = i.serialKey ? `|sn:${i.serialKey}` : "";
  const disp = (it.stock_disposition ?? "SALEABLE").trim().toUpperCase() || "SALEABLE";
  return `p${i.productId}|b:${i.batchNumber}|e:${i.expiryKey}|c:${i.carrierId ?? "L"}|d:${disp}${sn}`;
}

export type ReceivingLineGroup = {
  key: string;
  primary: StockDocumentItemRead;
  siblings: StockDocumentItemRead[];
  totalReceived: number;
};

export type BuildReceivingLineGroupsOpts = {
  /** Pokaż produkty dodane do PZ z ilością 0 (kotwica przed pierwszym przyjęciem). */
  includePendingProducts?: boolean;
};

export function buildReceivingLineGroups(
  items: StockDocumentItemRead[],
  opts?: BuildReceivingLineGroupsOpts,
): ReceivingLineGroup[] {
  const includePending = opts?.includePendingProducts ?? false;
  const map = new Map<string, StockDocumentItemRead[]>();
  for (const it of items) {
    if (!includePending && isGhostReceivingLine(it)) continue;
    const k = receivingLineGroupKey(it);
    const arr = map.get(k) ?? [];
    arr.push(it);
    map.set(k, arr);
  }
  const groups: ReceivingLineGroup[] = [];
  for (const [key, siblings] of map) {
    const sorted = [...siblings].sort((a, b) => a.id - b.id);
    const totalReceived = sorted.reduce((s, x) => s + toReceivingCountValue(x.received_quantity), 0);
    const primary = sorted.reduce((best, cur) =>
      toReceivingCountValue(cur.received_quantity) > toReceivingCountValue(best.received_quantity) ? cur : best,
    );
    groups.push({ key, primary, siblings: sorted, totalReceived });
  }
  return groups;
}

export function getReceivingSiblings(
  items: StockDocumentItemRead[],
  anchor: StockDocumentItemRead,
): StockDocumentItemRead[] {
  const key = receivingLineGroupKey(anchor);
  return items.filter((it) => receivingLineGroupKey(it) === key && !isGhostReceivingLine(it));
}

/**
 * Cross-carrier / cross-disposition lines for the same product lot (modal context only).
 * Do not use for card grid breakdown — use {@link getReceivingSiblings} per card group.
 */
export function getReceivingLotSiblings(
  items: StockDocumentItemRead[],
  anchor: StockDocumentItemRead,
): StockDocumentItemRead[] {
  const pid = Number(anchor.product_id) || 0;
  if (pid <= 0) return getReceivingSiblings(items, anchor);
  const batch = (anchor.batch_number ?? "").trim();
  const expiry = normalizeReceivingExpiryKey(anchor.expiry_date);
  const serial = receivingSerialKey(anchor);
  return items.filter((it) => {
    if (isGhostReceivingLine(it)) return false;
    if (Number(it.product_id) !== pid) return false;
    if ((it.batch_number ?? "").trim() !== batch) return false;
    if (normalizeReceivingExpiryKey(it.expiry_date) !== expiry) return false;
    if (receivingSerialKey(it) !== serial) return false;
    return true;
  });
}

export function carrierSplitLabel(it: StockDocumentItemRead): string {
  const code = (it.warehouse_carrier_code || "").trim();
  return code || "Luzem";
}

export function formatReceivingBatchLabel(it: StockDocumentItemRead): string | null {
  const b = (it.batch_number ?? "").trim();
  if (!b) return null;
  return b;
}

export function formatReceivingExpiryLabel(it: StockDocumentItemRead): string | null {
  return formatExpiryDatePl(it.expiry_date) ?? null;
}

export function formatReceivingSerialLabel(it: StockDocumentItemRead): string | null {
  const sn = receivingSerialKey(it);
  if (sn) return sn;
  const range = (it.serial_range_label ?? "").trim();
  return range || null;
}

/** Pick line for scan / modal anchor — never merge different lots by product_id alone. */
export function pickReceivingLineForProduct(
  items: StockDocumentItemRead[],
  productId: number,
  lastTouched: Record<number, number>,
  opts?: {
    warehouseCarrierId?: number | null;
    batchNumber?: string | null;
    expiryIso?: string | null;
    serialNumber?: string | null;
    preferGhost?: boolean;
  },
): StockDocumentItemRead | null {
  const pid = Number(productId);
  const all = items.filter((it) => it.product_id === pid);
  if (!all.length) return null;

  const probeCarrier = opts?.warehouseCarrierId ?? null;
  const probeBatch = (opts?.batchNumber ?? "").trim();
  const probeExpiry = normalizeReceivingExpiryKey(opts?.expiryIso);
  const probeSerial = (opts?.serialNumber ?? "").trim();

  if (probeSerial) {
    const hit = all.find((it) => receivingSerialKey(it) === probeSerial);
    if (hit) return hit;
    return null;
  }

  if (probeBatch || probeExpiry) {
    const probe = {
      id: 0,
      product_id: pid,
      ordered_quantity: 0,
      received_quantity: 0,
      quantity: 0,
      batch_number: probeBatch,
      expiry_date: probeExpiry || null,
      warehouse_carrier_id: probeCarrier,
      serial_numbers: [],
      difference: 0,
      value_net: null,
      vat_rate: 23,
    } as StockDocumentItemRead;
    const hit = all.find((it) => !isGhostReceivingLine(it) && isSameReceivingStock(it, probe));
    if (hit) return hit;
  }

  const ghosts = all.filter((it) => isGhostReceivingLine(it));
  if (opts?.preferGhost !== false && ghosts.length) {
    return [...ghosts].sort((a, b) => (lastTouched[b.id] || 0) - (lastTouched[a.id] || 0) || b.id - a.id)[0];
  }

  const tracksLot = all.some((it) => it.track_batch || it.track_expiry || it.track_serial);
  if (tracksLot) {
    return ghosts[0] ?? null;
  }

  const lines = all.filter((it) => !isGhostReceivingLine(it));
  if (!lines.length) return ghosts[0] ?? all[0] ?? null;
  return [...lines].sort(
    (a, b) => (lastTouched[b.id] || 0) - (lastTouched[a.id] || 0) || b.id - a.id,
  )[0];
}
