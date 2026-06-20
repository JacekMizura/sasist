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

export function useProductsListColumnOrder(catalog: readonly FilterFieldCatalogItem[]) {
  const allowedIds = productListColumnIds(catalog);

  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    normalizeColumnOrder(
      migrateProductListColumnLayout(
        loadColumnLayout(PRODUCTS_COLUMNS_LAYOUT_KEY, allowedIds, PRODUCT_LIST_DEFAULT_COLUMN_ORDER),
      ),
      allowedIds,
      PRODUCT_LIST_DEFAULT_COLUMN_ORDER,
    ),
  );

  useEffect(() => {
    setColumnOrder((prev) =>
      normalizeColumnOrder(migrateProductListColumnLayout(prev), allowedIds, PRODUCT_LIST_DEFAULT_COLUMN_ORDER),
    );
  }, [allowedIds.join("|")]);

  const persistColumnOrder = useCallback(
    (next: string[]) => {
      const normalized = normalizeColumnOrder(
        migrateProductListColumnLayout(next),
        allowedIds,
        PRODUCT_LIST_DEFAULT_COLUMN_ORDER,
      );
      setColumnOrder(normalized);
      saveColumnLayout(PRODUCTS_COLUMNS_LAYOUT_KEY, normalized);
    },
    [allowedIds],
  );

  return { columnOrder, persistColumnOrder };
}
