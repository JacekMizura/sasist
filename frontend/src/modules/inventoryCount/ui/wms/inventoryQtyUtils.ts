import type { WmsQtyInputMode } from "../../wmsInventoryExecutionContext";

/** UI-only counters — backend stores final piece total only. */
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

const MAX_COUNTER = 999_999;

export function safePackSize(pack: number | null | undefined): number | null {
  if (pack == null || !Number.isFinite(pack) || pack < 1) return null;
  return Math.floor(pack);
}

export function parsedUInt(text: string): number {
  const t = text.trim();
  if (t === "") return 0;
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function clampCounter(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_COUNTER, Math.max(0, Math.floor(n)));
}

export function piecesToCartonUnit(pieces: number, pack: number): { cartons: number; units: number } {
  const p = Math.max(1, Math.floor(pack));
  const safe = clampCounter(Math.round(pieces));
  return { cartons: Math.floor(safe / p), units: safe % p };
}

/** SSOT total — computed only from cartons + pieces, never stored as editable state. */
export function inventoryTotalPieces(state: InventoryQtyEditState, pack: number): number {
  const p = Math.max(1, Math.floor(pack));
  return clampCounter(state.cartonsCount) * p + clampCounter(state.unitsCount);
}

export function inventoryQtyFromPieces(
  pieces: number,
  pack: number,
  mode: WmsQtyInputMode = "unit",
): InventoryQtyEditState {
  const { cartons, units } = piecesToCartonUnit(pieces, pack);
  return { cartonsCount: cartons, unitsCount: units, inputMode: mode, draft: null };
}

export function clampInventoryQtyState(state: InventoryQtyEditState): InventoryQtyEditState {
  return {
    ...state,
    cartonsCount: clampCounter(state.cartonsCount),
    unitsCount: clampCounter(state.unitsCount),
  };
}

export function commitInventoryQtyDraft(state: InventoryQtyEditState): InventoryQtyEditState {
  if (state.draft === null) return clampInventoryQtyState(state);
  const mode = state.inputMode;
  const raw = state.draft !== "" ? state.draft : String(mode === "carton" ? state.cartonsCount : state.unitsCount);
  const v = parsedUInt(raw);
  if (mode === "carton") {
    return clampInventoryQtyState({ ...state, draft: null, cartonsCount: v });
  }
  return clampInventoryQtyState({ ...state, draft: null, unitsCount: v });
}

export function normalizeInventoryQty(state: InventoryQtyEditState, pack: number): InventoryQtyEditState {
  const total = inventoryTotalPieces(state, pack);
  return inventoryQtyFromPieces(total, pack, state.inputMode);
}

/** Re-sync cartons/pieces from authoritative piece total when pack size is known. */
export function inventoryQtyFromTotalPieces(
  totalPieces: number | null | undefined,
  pack: number | null | undefined,
  mode: WmsQtyInputMode = "unit",
): InventoryQtyEditState | null {
  if (totalPieces == null || !Number.isFinite(totalPieces)) return null;
  const p = safePackSize(pack);
  if (p == null) return null;
  return inventoryQtyFromPieces(totalPieces, p, mode);
}

export function formatPackagingHelper(pieces: number, pack: number): string | null {
  if (pack <= 1) return null;
  const safe = clampCounter(Math.round(pieces));
  if (safe === 0) return null;
  const { cartons, units } = piecesToCartonUnit(safe, pack);
  if (cartons > 0 && units === 0) {
    const label = cartons === 1 ? "karton" : cartons < 5 ? "kartony" : "kartonów";
    return `${cartons} ${label} × ${pack} szt.`;
  }
  if (cartons > 0 && units > 0) {
    return `${cartons} krt. × ${pack} szt. + ${units} szt.`;
  }
  return null;
}

/** @deprecated use formatPackagingHelper */
export function formatCartonUnitSummary(pieces: number, pack: number): string | null {
  return formatPackagingHelper(pieces, pack);
}
