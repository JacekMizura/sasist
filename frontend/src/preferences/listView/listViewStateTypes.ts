export const LIST_VIEW_SCHEMA_VERSION = 1;

export type ListViewSortState = {
  key: string;
  dir: "asc" | "desc";
};

export type ListViewStatePayload = {
  filters: unknown;
  sort: ListViewSortState | null;
  pagination: { pageSize: number; page?: number };
  columns: { order: string[] };
  filterFields: { visibleOrder: string[] };
  ui?: {
    filtersExpanded?: boolean;
    extensions?: Record<string, unknown>;
  };
};

export type ListViewAutosaveRecord = {
  id: number;
  payload: ListViewStatePayload;
  schema_version: number;
  updated_at: string | null;
};

export type ListViewPresetRecord = {
  id: number;
  name: string;
  is_default: boolean;
  is_public: boolean;
  user_id: number | null;
  payload: ListViewStatePayload;
  schema_version: number;
  updated_at: string | null;
  created_at: string | null;
};

export type ListViewScreenBundle = {
  screen_key: string;
  autosave: ListViewAutosaveRecord | null;
  presets: ListViewPresetRecord[];
};

export type ColumnCatalogConfig = {
  allowedIds: readonly string[];
  defaultOrder: readonly string[];
  migrate?: (columns: string[]) => string[];
};

export type FilterFieldCatalogConfig = {
  ids: readonly string[];
  defaultVisible?: readonly string[];
};

export type ListViewAdapterConfig<TFilters> = {
  screenId: string;
  tenantId: number;
  enabled?: boolean;
  createFactoryDefault: () => ListViewStatePayload;
  filterDefaults: TFilters;
  serializeFilters: (filters: TFilters) => unknown;
  deserializeFilters: (raw: unknown, defaults: TFilters) => TFilters;
  columnCatalog: ColumnCatalogConfig;
  filterFieldCatalog: FilterFieldCatalogConfig;
  legacyLocalStorage?: () => Partial<ListViewStatePayload> | null;
};

export type SavePresetInput = {
  name: string;
  isPublic?: boolean;
  isDefault?: boolean;
  overwritePresetId?: number;
};
