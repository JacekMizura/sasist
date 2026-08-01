import type { ColumnCatalogItem } from "../../columnPicker/ColumnSelectorModal";

export type ReturnListColumnDef = {
  id: string;
  label: string;
  type: "system" | "user";
};

/** Kolumny użytkownika — wybór / kolejność w „Wybór kolumn”. */
export const RETURN_LIST_COLUMN_DEFINITIONS: ReturnListColumnDef[] = [
  { id: "number", label: "Numer / data", type: "user" },
  { id: "status", label: "Status", type: "user" },
  { id: "products", label: "Produkty", type: "user" },
  { id: "customer", label: "Klient", type: "user" },
  { id: "channel", label: "Źródło", type: "user" },
  { id: "refund", label: "Zwrot środków", type: "user" },
];

export const RETURN_LIST_TABLE_COLUMN_CATALOG: ColumnCatalogItem[] = RETURN_LIST_COLUMN_DEFINITIONS.map((c) => ({
  id: c.id,
  label: c.label,
  type: c.type,
}));

export const RETURN_LIST_USER_COLUMN_IDS = RETURN_LIST_TABLE_COLUMN_CATALOG.map((c) => c.id);

export const RETURN_LIST_DEFAULT_TABLE_COLUMN_ORDER = [
  "number",
  "status",
  "products",
  "customer",
  "channel",
  "refund",
] as const;

export function migrateReturnListColumnIds(ids: string[]): string[] {
  const allowed = new Set(RETURN_LIST_USER_COLUMN_IDS);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
