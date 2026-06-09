import type { WmsQtyInputMode } from "../../wmsInventoryExecutionContext";

export type InventoryQtyEditState = {
  cartonsCount: number;
  unitsCount: number;
  inputMode: WmsQtyInputMode;
  draft: string | null;
};

export const EMPTY_INVENTORY_QTY: InventoryQtyEditState = {
  cartonsCount: 0,
  unitsCount: 0,
  inputMode: "unit",
  draft: null,
};

export function parsedUInt(text: string): number {
  const t = text.trim();
  if (t === "") return 0;
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function piecesToCartonUnit(pieces: number, pack: number): { cartons: number; units: number } {
  const p = Math.max(1, Math.floor(pack));
  const safe = Math.max(0, Math.round(pieces));
  return { cartons: Math.floor(safe / p), units: safe % p };
}

export function inventoryTotalPieces(state: InventoryQtyEditState, pack: number): number {
  const p = Math.max(1, Math.floor(pack));
  return Math.max(0, state.cartonsCount) * p + Math.max(0, state.unitsCount);
}

export function inventoryQtyFromPieces(
  pieces: number,
  pack: number,
  mode: WmsQtyInputMode = "unit",
): InventoryQtyEditState {
  const { cartons, units } = piecesToCartonUnit(pieces, pack);
  return { cartonsCount: cartons, unitsCount: units, inputMode: mode, draft: null };
}

export function commitInventoryQtyDraft(state: InventoryQtyEditState): InventoryQtyEditState {
  if (state.draft === null) return state;
  const mode = state.inputMode;
  const raw = state.draft !== "" ? state.draft : String(mode === "carton" ? state.cartonsCount : state.unitsCount);
  const v = parsedUInt(raw);
  if (mode === "carton") {
    return { ...state, draft: null, cartonsCount: v };
  }
  return { ...state, draft: null, unitsCount: v };
}

export function normalizeInventoryQty(state: InventoryQtyEditState, pack: number): InventoryQtyEditState {
  const total = inventoryTotalPieces(state, pack);
  return inventoryQtyFromPieces(total, pack, state.inputMode);
}

/** Small helper — e.g. „2 krt. + 3 szt.” — not for primary input. */
export function formatCartonUnitSummary(pieces: number, pack: number): string | null {
  if (pack <= 1) return null;
  const { cartons, units } = piecesToCartonUnit(pieces, pack);
  if (cartons === 0 && units === 0) return null;
  const parts: string[] = [];
  if (cartons > 0) parts.push(`${cartons} krt.`);
  if (units > 0) parts.push(`${units} szt.`);
  return parts.join(" + ");
}
