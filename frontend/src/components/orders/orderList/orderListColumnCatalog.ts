import type { ColumnCatalogItem } from "../../columnPicker/ColumnSelectorModal";

const LEGACY_ORDER_COLUMN_IDS = new Set(["date", "id", "panel_status"]);

export type OrderListColumnType = "system" | "user";

export type OrderListColumnDef = {
  /** Column id (matches switch keys in OrderListDenseTable). */
  id: string;
  label: string;
  type: OrderListColumnType;
  width?: number;
};

const SYSTEM_COLUMN_IDS = new Set(["actions"]);

/** Full column metadata (system + user). */
export const ORDER_LIST_COLUMN_DEFINITIONS: OrderListColumnDef[] = [
  { id: "actions", label: "Akcje", type: "system", width: 64 },
  { id: "order_core", label: "Data / numer / status", type: "user" },
  { id: "products", label: "Produkty", type: "user" },
  { id: "customer", label: "Klient", type: "user" },
  { id: "value", label: "Wartość / płatność", type: "user" },
  { id: "gross_profit", label: "Zysk", type: "user" },
  { id: "margin_percent", label: "Marża %", type: "user" },
  { id: "carrier", label: "Dostawa", type: "user" },
];

/** Kolumny zapisywane w preferencjach i widoczne w selektorze — wyłącznie `user`. */
export const ORDER_LIST_TABLE_COLUMN_CATALOG: ColumnCatalogItem[] = ORDER_LIST_COLUMN_DEFINITIONS.filter(
  (c) => c.type === "user",
).map(({ id, label }) => ({ id, label, type: "user" as const }));

/** Dopuszczalne id przy normalizacji localStorage (bez kolumn systemowych). */
export const ORDER_LIST_USER_COLUMN_IDS = ORDER_LIST_TABLE_COLUMN_CATALOG.map((c) => c.id);

/** @deprecated Użyj ORDER_LIST_USER_COLUMN_IDS */
export const ORDER_LIST_TABLE_CATALOG_IDS = ORDER_LIST_USER_COLUMN_IDS;

export const ORDER_LIST_DEFAULT_TABLE_COLUMN_ORDER = [
  "order_core",
  "products",
  "customer",
  "value",
  "carrier",
  "gross_profit",
  "margin_percent",
];

/** Zamienia zapisane kolumny `date` / `id` / `panel_status` na jedną `order_core`; usuwa id systemowe z migracji. */
export function migrateOrderListColumnIds(ids: string[]): string[] {
  const withoutSystem = ids.filter((id) => !SYSTEM_COLUMN_IDS.has(id));
  if (withoutSystem.includes("order_core")) {
    return withoutSystem.filter((id) => !LEGACY_ORDER_COLUMN_IDS.has(id));
  }
  const fi = withoutSystem.findIndex((id) => LEGACY_ORDER_COLUMN_IDS.has(id));
  if (fi < 0) return withoutSystem;
  let prefix = 0;
  for (let i = 0; i < fi; i++) {
    if (!LEGACY_ORDER_COLUMN_IDS.has(withoutSystem[i])) prefix++;
  }
  const filtered = withoutSystem.filter((id) => !LEGACY_ORDER_COLUMN_IDS.has(id));
  return [...filtered.slice(0, prefix), "order_core", ...filtered.slice(prefix)];
}
