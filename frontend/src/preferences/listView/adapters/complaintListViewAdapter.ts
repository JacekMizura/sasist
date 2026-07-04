import { buildListViewAdapterConfig, factoryPayload, mergeFilterDefaults } from "../listViewAdapterFactory";
import type { ListViewAdapterConfig } from "../listViewStateTypes";

export const COMPLAINT_LIST_SCREEN_ID = "complaints.list";

export type AppliedComplaintListFilters = {
  search: string;
};

export const DEFAULT_APPLIED_COMPLAINT_LIST_FILTERS: AppliedComplaintListFilters = {
  search: "",
};

const FILTER_FIELD_IDS = ["search"] as const;
const PLACEHOLDER_COLUMNS = ["id"] as const;

export function buildComplaintListViewAdapter(tenantId: number): ListViewAdapterConfig<AppliedComplaintListFilters> {
  return buildListViewAdapterConfig({
    screenId: COMPLAINT_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_APPLIED_COMPLAINT_LIST_FILTERS,
    createFactoryDefault: () =>
      factoryPayload(DEFAULT_APPLIED_COMPLAINT_LIST_FILTERS, PLACEHOLDER_COLUMNS, FILTER_FIELD_IDS, {
        filtersExpanded: false,
        extensions: { panelFilter: "all", statusPanelCollapsed: false },
      }),
    columnCatalog: {
      allowedIds: PLACEHOLDER_COLUMNS,
      defaultOrder: PLACEHOLDER_COLUMNS,
    },
    filterFieldCatalog: {
      ids: FILTER_FIELD_IDS,
      defaultVisible: FILTER_FIELD_IDS,
    },
    legacy: {
      filterFieldsKey: "complaints.list.filters.v1",
      filtersExpandedKey: "complaints.list.filtersExpanded",
    },
    deserializeFilters: (raw, defaults) => mergeFilterDefaults(defaults, raw),
  });
}

export function readComplaintListPanelFilter(extensions: Record<string, unknown>): unknown {
  return extensions.panelFilter ?? "all";
}
