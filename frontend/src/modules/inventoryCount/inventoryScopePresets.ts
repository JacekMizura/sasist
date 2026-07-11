/** Operational scope presets — real warehouse inventory workflows. */

import type { InventoryDocumentFiltersConfig, InventoryScopeMode } from "./inventoryStrategyConfig";

export type InventoryScopePreset = {
  id: string;
  label: string;
  hint: string;
  scopeMode: InventoryScopeMode;
  apply: () => Partial<InventoryDocumentFiltersConfig>;
};

export const INVENTORY_SCOPE_PRESETS: InventoryScopePreset[] = [
  {
    id: "missing_ean",
    label: "Towar bez EAN",
    hint: "Produkty bez kodu kreskowego w kartotece",
    scopeMode: "dynamic",
    apply: () => ({
      scope_mode: "dynamic",
      dynamic: { missing_ean: true, stock_gt_zero: true },
    }),
  },
  {
    id: "stock_gt_zero",
    label: "Stany > 0",
    hint: "Pomija puste lokalizacje",
    scopeMode: "dynamic",
    apply: () => ({
      scope_mode: "dynamic",
      dynamic: { stock_gt_zero: true },
    }),
  },
  {
    id: "carriers",
    label: "Nośniki niezweryfikowane",
    hint: "Wybierz nośniki do weryfikacji",
    scopeMode: "carriers",
    apply: () => ({ scope_mode: "carriers", carrier_ids: [] }),
  },
  {
    id: "no_movement_90",
    label: "Brak ruchu > 90 dni",
    hint: "Towar bez ruchu magazynowego (wymaga historii ruchów)",
    scopeMode: "dynamic",
    apply: () => ({
      scope_mode: "dynamic",
      dynamic: { no_movement_days: 90, stock_gt_zero: true },
    }),
  },
  {
    id: "inactive_stock",
    label: "Towar problematyczny",
    hint: "Stany nieaktywne / wymagające weryfikacji",
    scopeMode: "dynamic",
    apply: () => ({
      scope_mode: "dynamic",
      dynamic: { inactive_stock: true, stock_gt_zero: true },
    }),
  },
];

export const VALUATION_HELP_TEXT =
  "Wartość różnic: ilość × cena zakupu netto. Priorytet: cena z migawki inwentaryzacji, potem bieżący koszt FIFO z kartoteki (nie cena sprzedaży).";
