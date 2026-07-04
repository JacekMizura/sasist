import {
  DEFAULT_APPLIED_RETURN_LIST_FILTERS,
  type AppliedReturnListFilters,
} from "../../../components/returns/returnList/returnListFilterTypes";
import { buildListViewAdapterConfig, factoryPayload, mergeFilterDefaults } from "../listViewAdapterFactory";
import type { ListViewAdapterConfig } from "../listViewStateTypes";

export const RETURN_LIST_SCREEN_ID = "returns.list";

const FILTER_FIELD_IDS = [
  "search",
  "return_status",
  "panel_status_multi",
  "date_range",
  "order_number",
  "customer",
  "warehouse",
  "courier",
  "has_panel_label",
  "tracking",
  "archive_scope",
] as const;

const DEFAULT_VISIBLE = ["search", "return_status", "panel_status_multi", "date_range"] as const;
const PLACEHOLDER_COLUMNS = ["id"] as const;

function deserializeReturnFilters(raw: unknown, defaults: AppliedReturnListFilters): AppliedReturnListFilters {
  const merged = mergeFilterDefaults(defaults, raw);
  if (!raw || typeof raw !== "object") return merged;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.panelStatusIds)) {
    merged.panelStatusIds = r.panelStatusIds.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  }
  if (r.listWarehouseId === null || r.listWarehouseId === "") merged.listWarehouseId = null;
  else if (r.listWarehouseId != null && r.listWarehouseId !== "") {
    const n = Number(r.listWarehouseId);
    merged.listWarehouseId = Number.isFinite(n) ? n : defaults.listWarehouseId;
  }
  return merged;
}

export function buildReturnListViewAdapter(tenantId: number): ListViewAdapterConfig<AppliedReturnListFilters> {
  return buildListViewAdapterConfig({
    screenId: RETURN_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_APPLIED_RETURN_LIST_FILTERS,
    createFactoryDefault: () =>
      factoryPayload(DEFAULT_APPLIED_RETURN_LIST_FILTERS, PLACEHOLDER_COLUMNS, DEFAULT_VISIBLE, {
        sort: { key: "created_at", dir: "desc" },
        filtersExpanded: false,
        extensions: { panelFilter: "all", statusPanelCollapsed: false },
      }),
    columnCatalog: {
      allowedIds: PLACEHOLDER_COLUMNS,
      defaultOrder: PLACEHOLDER_COLUMNS,
    },
    filterFieldCatalog: {
      ids: FILTER_FIELD_IDS,
      defaultVisible: DEFAULT_VISIBLE,
    },
    legacy: {
      filterFieldsKey: "returns.list.v2",
      filtersExpandedKey: "returns.list.filtersExpanded",
    },
    deserializeFilters: deserializeReturnFilters,
  });
}

export function readReturnListPanelFilter(extensions: Record<string, unknown>): unknown {
  return extensions.panelFilter ?? "all";
}
