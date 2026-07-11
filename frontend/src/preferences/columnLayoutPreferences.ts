/** localStorage keys — per browser profile (extend with user id when auth exists). */
import { log, error as logError } from "../utils/logger";

export const ORDERS_COLUMNS_LAYOUT_KEY = "orders_columns_layout";
export const PRODUCTS_COLUMNS_LAYOUT_KEY = "products_columns_layout";
export const CUSTOMERS_LIST_COLUMNS_LAYOUT_KEY = "customers_list_columns_layout";

export type ColumnLayoutFileV1 = {
  v: 1;
  columns: string[];
};

function parseStored(key: string, raw: string | null): string[] | null {
  log("[LS]", key, raw);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (j && typeof j === "object" && Array.isArray((j as ColumnLayoutFileV1).columns)) {
      return (j as ColumnLayoutFileV1).columns.map(String);
    }
    if (Array.isArray(j)) return j.map(String);
  } catch (e) {
    logError("[LS] columnLayout JSON.parse failed", key, e);
    return null;
  }
  return null;
}

/** Keep only known ids, preserve first occurrence order; fall back to default when empty. */
export type ColumnLayoutMigrate = (columns: string[]) => string[];

export function normalizeColumnOrder(
  stored: string[] | null | undefined,
  allowedIds: readonly string[],
  defaultOrder: readonly string[],
): string[] {
  const allow = new Set(allowedIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of stored ?? []) {
    if (!allow.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length === 0) {
    for (const id of defaultOrder) {
      if (allow.has(id) && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out.filter((id) => allow.has(id));
}

export function loadColumnLayout(
  key: string,
  allowedIds: readonly string[],
  defaultOrder: readonly string[],
  options?: { migrate?: ColumnLayoutMigrate },
): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = parseStored(key, raw);
    const migrated = options?.migrate ? options.migrate(parsed ?? []) : (parsed ?? []);
    return normalizeColumnOrder(migrated.length > 0 ? migrated : null, allowedIds, defaultOrder);
  } catch (e) {
    logError("[LS] loadColumnLayout failed", key, e);
    return normalizeColumnOrder(null, allowedIds, defaultOrder);
  }
}

export function saveColumnLayout(key: string, columns: string[]): void {
  try {
    const payload: ColumnLayoutFileV1 = { v: 1, columns };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}
