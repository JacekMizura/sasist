/**
 * Operator-first inventory configuration — scope, movement, count, result policies.
 */

export type InventoryScopeMode =
  | "full"
  | "zones"
  | "locations"
  | "products"
  | "categories"
  | "carriers"
  | "dynamic";

export type InventoryMovementPolicy = "allow_operations" | "block_picking" | "block_all";

export type InventoryResultPolicy = "update_stock" | "count_only" | "report_only";

export type InventoryCountMode = "blind" | "visible";

export interface InventoryDynamicFilters {
  stock_gt_zero?: boolean;
  include_zero_stock?: boolean;
  inactive_stock?: boolean;
  no_movement_days?: number | null;
  manufacturer_ids?: number[];
  missing_ean?: boolean;
}

export interface InventoryDocumentFiltersConfig {
  scope_mode: InventoryScopeMode;
  zone_ids?: number[];
  aisle?: string;
  rack?: string;
  location_ids?: number[];
  product_ids?: number[];
  category_ids?: number[];
  abc_class?: string;
  carrier_ids?: number[];
  dynamic?: InventoryDynamicFilters;
  include_zero_stock?: boolean;
}

export const SCOPE_MODE_OPTIONS: ReadonlyArray<{
  id: InventoryScopeMode;
  label: string;
  hint: string;
}> = [
  { id: "full", label: "Pełna inwentaryzacja", hint: "Wszystkie lokalizacje magazynu" },
  { id: "zones", label: "Strefy magazynu", hint: "Wybrane alejki i obszary" },
  { id: "locations", label: "Lokalizacje", hint: "Ręczny wybór lokalizacji (ID)" },
  { id: "products", label: "Produkty", hint: "Wybrane SKU / produkty (ID)" },
  { id: "categories", label: "Grupy produktów", hint: "Kategorie / grupy asortymentowe" },
  { id: "carriers", label: "Nośniki", hint: "Palety, kontenery (ID nośników)" },
  {
    id: "dynamic",
    label: "Filtry dynamiczne",
    hint: "Stan > 0, brak ruchu, brak EAN, klasa ABC…",
  },
];

export const MOVEMENT_POLICY_OPTIONS: ReadonlyArray<{
  id: InventoryMovementPolicy;
  label: string;
  hint: string;
}> = [
  {
    id: "allow_operations",
    label: "Zezwól na operacje magazynowe",
    hint: "Operatorzy mogą normalnie zbierać i przesuwać towary podczas inwentaryzacji",
  },
  {
    id: "block_picking",
    label: "Zablokuj zbieranie",
    hint: "Lokalizacje objęte inwentaryzacją są zablokowane dla zbierania",
  },
  {
    id: "block_all",
    label: "Zablokuj wszystkie ruchy",
    hint: "Całkowita blokada ruchów magazynowych dla objętych lokalizacji",
  },
];

export const COUNT_MODE_OPTIONS: ReadonlyArray<{
  id: InventoryCountMode;
  label: string;
  hint: string;
}> = [
  {
    id: "blind",
    label: "Liczba ślepa",
    hint: "Operator nie widzi stanu oczekiwanego — tylko policzoną ilość",
  },
  {
    id: "visible",
    label: "Liczba kontrolna",
    hint: "Operator widzi stan oczekiwany podczas liczenia",
  },
];

export const RESULT_POLICY_OPTIONS: ReadonlyArray<{
  id: InventoryResultPolicy;
  label: string;
  hint: string;
}> = [
  {
    id: "update_stock",
    label: "Aktualizuj stany magazynowe",
    hint: "Po zatwierdzeniu — korekty RW/PW według policzonych ilości",
  },
  {
    id: "count_only",
    label: "Tryb kontrolny (bez aktualizacji stanów)",
    hint: "Policz bez zmian magazynowych — weryfikacja stanu",
  },
  {
    id: "report_only",
    label: "Tylko raport różnic",
    hint: "Protokół różnic bez żadnych zmian magazynowych",
  },
];

/** Default scope for inventory type when user hasn't picked explicitly. */
export function defaultScopeForInventoryType(inventoryType: string): InventoryScopeMode {
  const t = inventoryType.toUpperCase();
  if (t === "FULL") return "full";
  if (t === "CYCLE") return "dynamic";
  if (t === "CONTROL") return "products";
  return "locations";
}

/** CONTROL inventories default to count-only result. */
export function defaultResultPolicyForType(inventoryType: string): InventoryResultPolicy {
  return inventoryType.toUpperCase() === "CONTROL" ? "count_only" : "update_stock";
}

export function emptyFilters(scopeMode: InventoryScopeMode): InventoryDocumentFiltersConfig {
  return { scope_mode: scopeMode };
}

export function parseIdList(raw: string): number[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}
