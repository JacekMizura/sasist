import type { FinishedGoodsIdentityBody } from "@/api/productionApi";

/** Parse LOT/SN textarea — same separators as RegisterProductionModal / paper card. */
export function parseFgSerialList(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function isProductionQtyValid(qty: number, remainingQty: number): boolean {
  return Number.isFinite(qty) && qty > 0 && qty <= remainingQty + 1e-9;
}

export type FgIdentityRequirements = {
  requireBatch?: boolean;
  requireSerial?: boolean;
  requireExpiry?: boolean;
};

/**
 * FE gate for FG identity before POST production-progress.
 * SN: exact count of unique serials must equal floor(qty) when required.
 */
export function isFgIdentityValid(
  qty: number,
  identity: {
    batchNumber?: string;
    expiryDate?: string;
    serialsRaw?: string;
    serialList?: string[];
  },
  req: FgIdentityRequirements,
): boolean {
  const serialList =
    identity.serialList ?? parseFgSerialList(identity.serialsRaw ?? "");
  const uniqueCount = new Set(serialList).size;
  if (req.requireBatch && !String(identity.batchNumber ?? "").trim()) return false;
  if (req.requireExpiry && !String(identity.expiryDate ?? "").trim()) return false;
  if (req.requireSerial) {
    const expected = Math.floor(qty);
    if (!Number.isFinite(expected) || expected < 1) return false;
    if (serialList.length !== expected || uniqueCount !== expected) return false;
  }
  return true;
}

export function canSubmitFgProduction(
  qty: number,
  remainingQty: number,
  identity: {
    batchNumber?: string;
    expiryDate?: string;
    serialsRaw?: string;
    serialList?: string[];
  },
  req: FgIdentityRequirements,
): boolean {
  return isProductionQtyValid(qty, remainingQty) && isFgIdentityValid(qty, identity, req);
}

export function buildFgIdentityBody(opts: {
  batchNumber: string;
  expiryDate: string;
  serialsRaw: string;
}): FinishedGoodsIdentityBody {
  return {
    fg_batch_number: opts.batchNumber.trim() || null,
    fg_expiry_date: opts.expiryDate || null,
    fg_serial_numbers: parseFgSerialList(opts.serialsRaw),
  };
}

/** Default „Wyprodukowano teraz” = remaining (floored for integer input). */
export function paperProduceDefaultQty(remainingQty: number): number {
  return Math.max(0, Math.floor(remainingQty));
}

/**
 * Single-line BAT/MO: only line card progress.
 * Multi-line: header aggregate + per-line cards.
 */
export function shouldShowPaperHeaderProductionProgress(lineCount: number): boolean {
  return lineCount > 1;
}

export function clampProduceQtyInput(value: number, remainingQty: number): number {
  if (!Number.isFinite(value)) return paperProduceDefaultQty(remainingQty);
  return Math.max(0, Math.min(Math.floor(remainingQty), Math.floor(value)));
}
