import type { ColumnCatalogConfig, FilterFieldCatalogConfig, ListViewAdapterConfig, ListViewStatePayload } from "./listViewStateTypes";
import { readLegacyColumnLayout, readLegacyFilterFieldOrder } from "./listViewCodec";
import { readFiltersExpandedLegacy } from "./listViewStorage";

export function mergeFilterDefaults<T extends object>(defaults: T, raw: unknown): T {
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;
  const out = { ...defaults } as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    const val = r[key];
    if (val === undefined) continue;
    const def = (defaults as Record<string, unknown>)[key];
    if (Array.isArray(def) && Array.isArray(val)) {
      out[key] = val.map((x) => (typeof x === "number" ? x : Number(x))).filter((x) => Number.isFinite(x));
    } else if (typeof def === typeof val) {
      out[key] = val;
    } else if (def === null && (val === null || typeof val === "number" || val === "")) {
      out[key] = val === "" || val == null ? null : Number(val);
    }
  }
  return out as T;
}

type LegacyKeys = {
  columnKey?: string;
  filterFieldsKey?: string;
  filtersExpandedKey?: string;
  filtersExpandedDefault?: boolean;
};

export function buildListViewAdapterConfig<TFilters extends object>(opts: {
  screenId: string;
  tenantId: number;
  filterDefaults: TFilters;
  createFactoryDefault: () => ListViewStatePayload;
  columnCatalog: ColumnCatalogConfig;
  filterFieldCatalog: FilterFieldCatalogConfig;
  legacy?: LegacyKeys;
  deserializeFilters?: (raw: unknown, defaults: TFilters) => TFilters;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  defaultPageSize?: number;
}): ListViewAdapterConfig<TFilters> {
  const deserialize = opts.deserializeFilters ?? ((raw, defaults) => mergeFilterDefaults(defaults, raw));
  return {
    screenId: opts.screenId,
    tenantId: opts.tenantId,
    filterDefaults: opts.filterDefaults,
    createFactoryDefault: opts.createFactoryDefault,
    serializeFilters: (f) => f,
    deserializeFilters: deserialize,
    columnCatalog: opts.columnCatalog,
    filterFieldCatalog: opts.filterFieldCatalog,
    legacyLocalStorage: opts.legacy
      ? () => ({
          columns: opts.legacy?.columnKey
            ? {
                order: readLegacyColumnLayout(opts.legacy.columnKey, opts.columnCatalog),
              }
            : undefined,
          filterFields: opts.legacy?.filterFieldsKey
            ? {
                visibleOrder: readLegacyFilterFieldOrder(opts.legacy.filterFieldsKey, opts.filterFieldCatalog),
              }
            : undefined,
          ui: opts.legacy?.filtersExpandedKey
            ? {
                filtersExpanded: readFiltersExpandedLegacy(
                  opts.legacy.filtersExpandedKey,
                  opts.legacy.filtersExpandedDefault ?? false,
                ),
              }
            : undefined,
        })
      : undefined,
  };
}

export function factoryPayload(
  filters: unknown,
  columnOrder: readonly string[],
  filterFieldIds: readonly string[],
  opts?: {
    sort?: { key: string; dir: "asc" | "desc" } | null;
    pageSize?: number;
    filtersExpanded?: boolean;
    extensions?: Record<string, unknown>;
  },
): ListViewStatePayload {
  return {
    filters,
    sort: opts?.sort ?? null,
    pagination: { pageSize: opts?.pageSize ?? 25, page: 1 },
    columns: { order: [...columnOrder] },
    filterFields: { visibleOrder: [...filterFieldIds] },
    ui: {
      filtersExpanded: opts?.filtersExpanded ?? false,
      extensions: opts?.extensions,
    },
  };
}
