import type { StockIntakeMode } from "../../../types/wmsReturn";

export type StockIntakeTileId = "FG" | "DISASSEMBLE" | "MIXED";

export function resolveStockIntakeMode(fgQty: number, disassemblyQty: number): StockIntakeMode | null {
  if (fgQty > 0 && disassemblyQty > 0) return "MIXED";
  if (disassemblyQty > 0) return "DISASSEMBLE";
  if (fgQty > 0) return "FG";
  return null;
}

export function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** Keep FG + disassembly covering the full returned qty. */
export function splitReturnedQty(
  physical: number,
  tile: StockIntakeTileId,
  mixedFg?: number,
): { fg: number; dq: number; mode: StockIntakeMode } {
  const phys = Math.max(0, Math.floor(physical));
  if (tile === "FG") return { fg: phys, dq: 0, mode: "FG" };
  if (tile === "DISASSEMBLE") return { fg: 0, dq: phys, mode: "DISASSEMBLE" };
  if (phys <= 1) {
    // Cannot meaningfully split 0–1 units — prefer full disassemble for MIXED intent.
    return { fg: 0, dq: phys, mode: phys > 0 ? "DISASSEMBLE" : "FG" };
  }
  const fg = clampInt(mixedFg ?? 1, 0, phys - 1);
  return { fg, dq: Math.max(0, phys - fg), mode: "MIXED" };
}

export type IntakeCopy = {
  sectionTitle: string;
  badgeLabel: string;
  badgeHint: string;
  segments: { id: StockIntakeTileId; label: string }[];
  fgResultLabel: string;
  disassembleResultLabel: string;
  mixedFgLabel: string;
  mixedDqLabel: string;
  componentsTitle: string;
  perUnitSuffix: string;
  qtyOneDisassembleLead: string;
};

export const MANUFACTURED_INTAKE_COPY: IntakeCopy = {
  sectionTitle: "Sposób przyjęcia magazynowego",
  badgeLabel: "Produkt produkowany",
  badgeHint: "Produkt ma recepturę i może zostać rozmontowany na komponenty.",
  segments: [
    { id: "FG", label: "Gotowy produkt" },
    { id: "DISASSEMBLE", label: "Rozmontuj" },
    { id: "MIXED", label: "Częściowo" },
  ],
  fgResultLabel: "Przyjęte jako wyrób",
  disassembleResultLabel: "Do rozmontowania",
  mixedFgLabel: "Gotowy wyrób",
  mixedDqLabel: "Rozmontuj",
  componentsTitle: "Komponenty po rozmontowaniu",
  perUnitSuffix: "szt. / wyrób",
  qtyOneDisassembleLead: "Rozmontuj cały produkt",
};

export const BUNDLE_INTAKE_COPY: IntakeCopy = {
  sectionTitle: "Sposób przyjęcia magazynowego",
  badgeLabel: "Zestaw",
  badgeHint: "Zestaw handlowy można zwrócić w całości lub rozmontować na elementy.",
  segments: [
    { id: "FG", label: "Zestaw w całości" },
    { id: "DISASSEMBLE", label: "Rozmontuj" },
    { id: "MIXED", label: "Częściowo" },
  ],
  fgResultLabel: "Przyjęte jako zestaw",
  disassembleResultLabel: "Do rozmontowania",
  mixedFgLabel: "Zestaw",
  mixedDqLabel: "Rozmontuj",
  componentsTitle: "Elementy zestawu",
  perUnitSuffix: "szt. / zestaw",
  qtyOneDisassembleLead: "Rozmontuj cały zestaw",
};

/** @deprecated alias — keep old import sites compiling during refactor */
export type ManufacturedIntakeCopy = IntakeCopy;
