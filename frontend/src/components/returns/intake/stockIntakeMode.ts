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

/** Keep FG + disassembly covering the full returned qty (reference UX). */
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

export type ManufacturedIntakeCopy = {
  sectionTitle: string;
  tiles: {
    id: StockIntakeTileId;
    title: string;
    description: string;
    footerKind: "fg" | "disassemble" | "mixed";
    mixedFgLabel: string;
    mixedDqLabel: string;
  }[];
  previewTitle: string;
  sideTitle: string;
  sideLead: string;
  sideBody: string;
  tableHeaders: {
    name: string;
    sku: string;
    ratio: string;
    perOne: string;
    perMany: string;
    available: string;
    action: string;
  };
};

export const MANUFACTURED_INTAKE_COPY: ManufacturedIntakeCopy = {
  sectionTitle: "Sposób przyjęcia magazynowego",
  tiles: [
    {
      id: "FG",
      title: "Przyjmij jako gotowy produkt",
      description: "Zwracamy wyrób bez rozmontowania.",
      footerKind: "fg",
      mixedFgLabel: "Gotowy wyrób",
      mixedDqLabel: "Do rozmontowania",
    },
    {
      id: "DISASSEMBLE",
      title: "Rozmontuj produkt (wszystko)",
      description: "Rozmontuj cały wyrób na komponenty zgodnie ze strukturą produkcji.",
      footerKind: "disassemble",
      mixedFgLabel: "Gotowy wyrób",
      mixedDqLabel: "Do rozmontowania",
    },
    {
      id: "MIXED",
      title: "Częściowo rozmontuj",
      description: "Część przyjmij jako wyrób, a część rozmontuj na komponenty.",
      footerKind: "mixed",
      mixedFgLabel: "Gotowy wyrób",
      mixedDqLabel: "Do rozmontowania",
    },
  ],
  previewTitle: "Podgląd komponentów w przypadku rozmontowania",
  sideTitle: "Struktura produkcji",
  sideLead: "Produkt produkowany",
  sideBody: "Możesz przyjąć wyrób lub rozmontować go na komponenty zgodnie z recepturą.",
  tableHeaders: {
    name: "Komponent",
    sku: "SKU",
    ratio: "Współczynnik w wyrobie",
    perOne: "Ilość z 1 szt.",
    perMany: "Ilość z {n} szt.",
    available: "Dostępne na stanie",
    action: "Akcja",
  },
};

export const BUNDLE_INTAKE_COPY: ManufacturedIntakeCopy = {
  sectionTitle: "Sposób przyjęcia magazynowego",
  tiles: [
    {
      id: "FG",
      title: "Przyjmij zestaw jako całość",
      description: "Zwracamy kompletny zestaw bez rozmontowania.",
      footerKind: "fg",
      mixedFgLabel: "Zestaw jako całość",
      mixedDqLabel: "Do rozmontowania",
    },
    {
      id: "DISASSEMBLE",
      title: "Rozmontuj zestaw (wszystko)",
      description: "Rozmontuj cały zestaw na poszczególne elementy.",
      footerKind: "disassemble",
      mixedFgLabel: "Zestaw jako całość",
      mixedDqLabel: "Do rozmontowania",
    },
    {
      id: "MIXED",
      title: "Częściowo rozmontuj",
      description: "Część przyjmij jako zestaw, a część rozmontuj na elementy.",
      footerKind: "mixed",
      mixedFgLabel: "Zestaw jako całość",
      mixedDqLabel: "Do rozmontowania",
    },
  ],
  previewTitle: "Podgląd elementów zestawu w przypadku rozmontowania",
  sideTitle: "Zawartość zestawu",
  sideLead: "To zestaw handlowy",
  sideBody: "Możesz zwrócić zestaw w całości lub rozmontować go na elementy zgodnie ze składem.",
  tableHeaders: {
    name: "Element zestawu",
    sku: "SKU",
    ratio: "Ilość w zestawie",
    perOne: "Ilość z 1 zestawu",
    perMany: "Ilość z {n} zestawów",
    available: "Dostępne na stanie",
    action: "Akcja",
  },
};
