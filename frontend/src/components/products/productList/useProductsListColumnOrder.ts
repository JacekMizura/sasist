import { useCallback, useEffect, useState } from "react";

import {
  loadColumnLayout,
  normalizeColumnOrder,
  saveColumnLayout,
} from "../../../preferences/columnLayoutPreferences";
import type { FilterFieldCatalogItem } from "../../filters";
import {
  migrateProductListColumnLayout,
  PRODUCT_LIST_DEFAULT_COLUMN_ORDER,
  PRODUCTS_COLUMNS_LAYOUT_KEY,
  productListColumnIds,
} from "./productListColumnCatalog";

type ControlledColumnOrder = {
  order: string[];
  onChange: (next: string[]) => void;
};

/**
 * Product list column order — thin wrapper around column layout prefs.
 * Pass `controlled` when using `useListViewState` (persistence via list view module).
 */
export function useProductsListColumnOrder(
  catalog: readonly FilterFieldCatalogItem[],
  controlled?: ControlledColumnOrder,
) {
  const allowedIds = productListColumnIds(catalog);

  const [internalOrder, setInternalOrder] = useState<string[]>(() =>
    normalizeColumnOrder(
      migrateProductListColumnLayout(
        loadColumnLayout(PRODUCTS_COLUMNS_LAYOUT_KEY, allowedIds, PRODUCT_LIST_DEFAULT_COLUMN_ORDER),
      ),
      allowedIds,
      PRODUCT_LIST_DEFAULT_COLUMN_ORDER,
    ),
  );

  useEffect(() => {
    if (controlled) return;
    setInternalOrder((prev) =>
      normalizeColumnOrder(migrateProductListColumnLayout(prev), allowedIds, PRODUCT_LIST_DEFAULT_COLUMN_ORDER),
    );
  }, [allowedIds.join("|"), controlled]);

  const persistColumnOrder = useCallback(
    (next: string[]) => {
      const normalized = normalizeColumnOrder(
        migrateProductListColumnLayout(next),
        allowedIds,
        PRODUCT_LIST_DEFAULT_COLUMN_ORDER,
      );
      if (controlled) {
        controlled.onChange(normalized);
        return;
      }
      setInternalOrder(normalized);
      saveColumnLayout(PRODUCTS_COLUMNS_LAYOUT_KEY, normalized);
    },
    [allowedIds, controlled],
  );

  const columnOrder = controlled?.order ?? internalOrder;

  return { columnOrder, persistColumnOrder };
}
