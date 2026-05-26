import type { StockDocumentItemRead } from "../../api/stockDocumentsApi";
import { PUTAWAY_FLOAT_EPS } from "./putawayLineUtils";

export function isReceivingInProgress(receivingStatus: string | null | undefined): boolean {
  return String(receivingStatus ?? "").toUpperCase() !== "DONE";
}

/** Cel licznika rozlokowania: przyjęte (live) vs cały dokument (po zamknięciu PZ). */
export function putawayTargetQuantity(
  receivingStatus: string | null | undefined,
  totalOrdered: number,
  totalReceived: number,
): number {
  if (isReceivingInProgress(receivingStatus)) {
    return Math.max(0, totalReceived);
  }
  return Math.max(0, totalOrdered);
}

export function putawayLineDenominator(
  it: StockDocumentItemRead,
  receivingDone: boolean,
): number {
  const rec = Number(it.received_quantity) || 0;
  const ord = Number(it.ordered_quantity) || 0;
  if (receivingDone) {
    return ord > PUTAWAY_FLOAT_EPS ? ord : rec;
  }
  return rec;
}

export function sumPutawayProgress(
  items: StockDocumentItemRead[],
  receivingStatus: string | null | undefined,
  docTotalOrdered?: number,
  docTotalReceived?: number,
): { totalPut: number; target: number; pct: number } {
  let totalPut = 0;
  let sumReceived = 0;
  let sumOrdered = 0;
  for (const it of items) {
    totalPut += Number(it.quantity_putaway) || 0;
    sumReceived += Number(it.received_quantity) || 0;
    sumOrdered += Number(it.ordered_quantity) || 0;
  }
  const ordered = docTotalOrdered ?? sumOrdered;
  const received = docTotalReceived ?? sumReceived;
  const target = putawayTargetQuantity(receivingStatus, ordered, received);
  const pct = target > PUTAWAY_FLOAT_EPS ? Math.min(100, Math.round((totalPut / target) * 100)) : 0;
  return { totalPut, target, pct };
}
