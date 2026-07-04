import {
  loadVisibleFieldOrder,
  saveVisibleFieldOrder,
} from "../../components/filters/filterVisibilityStorage";
import {
  loadColumnLayout,
  normalizeColumnOrder,
  saveColumnLayout,
  type ColumnLayoutMigrate,
} from "../columnLayoutPreferences";
import type {
  ColumnCatalogConfig,
  FilterFieldCatalogConfig,
  ListViewPresetRecord,
  ListViewScreenBundle,
  ListViewStatePayload,
} from "./listViewStateTypes";

export function normalizeColumns(
  stored: string[] | null | undefined,
  catalog: ColumnCatalogConfig,
): string[] {
  const migrated = catalog.migrate ? catalog.migrate(stored ?? []) : (stored ?? []);
  return normalizeColumnOrder(migrated.length > 0 ? migrated : null, catalog.allowedIds, catalog.defaultOrder);
}

export function normalizeFilterFields(
  stored: string[] | null | undefined,
  catalog: FilterFieldCatalogConfig,
): string[] {
  const valid = new Set(catalog.ids);
  const out: string[] = [];
  for (const id of stored ?? []) {
    if (valid.has(id) && !out.includes(id)) out.push(id);
  }
  if (out.length === 0) {
    const defaults = catalog.defaultVisible?.filter((id) => valid.has(id)) ?? [];
    if (defaults.length > 0) return [...defaults];
    return [...catalog.ids];
  }
  return out;
}

export function mergeListViewPayload(
  factory: ListViewStatePayload,
  patch: Partial<ListViewStatePayload> | null | undefined,
): ListViewStatePayload {
  if (!patch) return factory;
  return {
    filters: patch.filters !== undefined ? patch.filters : factory.filters,
    sort: patch.sort !== undefined ? patch.sort : factory.sort,
    pagination: {
      pageSize: patch.pagination?.pageSize ?? factory.pagination.pageSize,
      page: patch.pagination?.page ?? factory.pagination.page,
    },
    columns: {
      order: patch.columns?.order?.length ? normalizeColumns(patch.columns.order, { allowedIds: factory.columns.order, defaultOrder: factory.columns.order }) : factory.columns.order,
    },
    filterFields: {
      visibleOrder: patch.filterFields?.visibleOrder?.length
        ? patch.filterFields.visibleOrder
        : factory.filterFields.visibleOrder,
    },
    ui: {
      ...factory.ui,
      ...patch.ui,
      extensions: {
        ...(factory.ui?.extensions ?? {}),
        ...(patch.ui?.extensions ?? {}),
      },
    },
  };
}

export function normalizeListViewPayload(
  raw: Partial<ListViewStatePayload> | null | undefined,
  factory: ListViewStatePayload,
  columnCatalog: ColumnCatalogConfig,
  filterFieldCatalog: FilterFieldCatalogConfig,
): ListViewStatePayload {
  const pageSize = raw?.pagination?.pageSize;
  const page = raw?.pagination?.page;
  return {
    filters: raw?.filters !== undefined ? raw.filters : factory.filters,
    sort: raw?.sort ?? factory.sort,
    pagination: {
      pageSize: typeof pageSize === "number" && pageSize > 0 ? pageSize : factory.pagination.pageSize,
      page: typeof page === "number" && page > 0 ? page : factory.pagination.page ?? 1,
    },
    columns: {
      order: normalizeColumns(raw?.columns?.order, columnCatalog),
    },
    filterFields: {
      visibleOrder: normalizeFilterFields(raw?.filterFields?.visibleOrder, filterFieldCatalog),
    },
    ui: {
      filtersExpanded: raw?.ui?.filtersExpanded ?? factory.ui?.filtersExpanded,
      extensions: {
        ...(factory.ui?.extensions ?? {}),
        ...(raw?.ui?.extensions ?? {}),
      },
    },
  };
}

export function payloadForAutosave(payload: ListViewStatePayload): ListViewStatePayload {
  return payload;
}

export function payloadForPreset(payload: ListViewStatePayload): ListViewStatePayload {
  return {
    ...payload,
    pagination: {
      pageSize: payload.pagination.pageSize,
    },
  };
}

export function resolveHydratedPayload(
  factory: ListViewStatePayload,
  bundle: ListViewScreenBundle | null,
  legacy: Partial<ListViewStatePayload> | null,
  columnCatalog: ColumnCatalogConfig,
  filterFieldCatalog: FilterFieldCatalogConfig,
): ListViewStatePayload {
  const privateDefault = bundle?.presets.find((p) => p.is_default && !p.is_public);
  const publicDefault = bundle?.presets.find((p) => p.is_default && p.is_public);
  const preset = privateDefault ?? publicDefault;
  if (preset?.payload) {
    return normalizeListViewPayload(preset.payload, factory, columnCatalog, filterFieldCatalog);
  }
  if (bundle?.autosave?.payload) {
    return normalizeListViewPayload(bundle.autosave.payload, factory, columnCatalog, filterFieldCatalog);
  }
  if (legacy) {
    return normalizeListViewPayload(legacy, factory, columnCatalog, filterFieldCatalog);
  }
  return factory;
}

export function pickDefaultPreset(bundle: ListViewScreenBundle | null): ListViewPresetRecord | null {
  if (!bundle) return null;
  return bundle.presets.find((p) => p.is_default && !p.is_public) ?? bundle.presets.find((p) => p.is_default && p.is_public) ?? null;
}

/** Legacy localStorage readers — used once during migration to backend autosave. */
export function readLegacyColumnLayout(legacyKey: string, catalog: ColumnCatalogConfig): string[] | null {
  try {
    return loadColumnLayout(legacyKey, catalog.allowedIds, catalog.defaultOrder, {
      migrate: catalog.migrate as ColumnLayoutMigrate | undefined,
    });
  } catch {
    return null;
  }
}

export function readLegacyFilterFieldOrder(storageKey: string, catalog: FilterFieldCatalogConfig): string[] | null {
  try {
    return loadVisibleFieldOrder(storageKey, catalog.ids, catalog.defaultVisible);
  } catch {
    return null;
  }
}

export function writeLegacyColumnLayout(legacyKey: string, order: string[]): void {
  saveColumnLayout(legacyKey, order);
}

export function writeLegacyFilterFieldOrder(storageKey: string, order: readonly string[]): void {
  saveVisibleFieldOrder(storageKey, order);
}
