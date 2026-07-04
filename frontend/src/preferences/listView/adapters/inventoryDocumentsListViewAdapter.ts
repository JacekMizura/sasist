import {
  DEFAULT_INVENTORY_DOCUMENT_LIST_FILTERS,
  type InventoryDocumentListFilters,
} from "../../../modules/inventoryCount/inventoryCountDocumentListFilters";
import { buildListViewAdapterConfig, factoryPayload, mergeFilterDefaults } from "../listViewAdapterFactory";
import type { ListViewAdapterConfig } from "../listViewStateTypes";

export const INVENTORY_DOCUMENTS_LIST_SCREEN_ID = "inventory_documents.list";

const FILTER_FIELD_IDS = ["query", "status", "type"] as const;
const PLACEHOLDER_COLUMNS = ["id"] as const;

export function buildInventoryDocumentsListViewAdapter(
  tenantId: number,
): ListViewAdapterConfig<InventoryDocumentListFilters> {
  return buildListViewAdapterConfig({
    screenId: INVENTORY_DOCUMENTS_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_INVENTORY_DOCUMENT_LIST_FILTERS,
    createFactoryDefault: () =>
      factoryPayload(DEFAULT_INVENTORY_DOCUMENT_LIST_FILTERS, PLACEHOLDER_COLUMNS, FILTER_FIELD_IDS, {
        filtersExpanded: false,
        extensions: { tenantId },
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
      filtersExpandedKey: "inventory_documents.list.filtersExpanded",
    },
    deserializeFilters: (raw, defaults) => mergeFilterDefaults(defaults, raw),
  });
}
