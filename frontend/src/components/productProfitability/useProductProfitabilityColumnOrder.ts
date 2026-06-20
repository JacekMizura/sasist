import { useCallback, useState } from "react";

import {
  loadColumnLayout,
  normalizeColumnOrder,
  saveColumnLayout,
} from "../../preferences/columnLayoutPreferences";
import {
  PRODUCT_PROFITABILITY_COLUMN_IDS,
  PRODUCT_PROFITABILITY_COLUMNS_LAYOUT_KEY,
  PRODUCT_PROFITABILITY_DEFAULT_COLUMN_ORDER,
} from "./productProfitabilityColumnCatalog";

export function useProductProfitabilityColumnOrder() {
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    loadColumnLayout(
      PRODUCT_PROFITABILITY_COLUMNS_LAYOUT_KEY,
      PRODUCT_PROFITABILITY_COLUMN_IDS,
      PRODUCT_PROFITABILITY_DEFAULT_COLUMN_ORDER,
    ),
  );

  const persistColumnOrder = useCallback((next: string[]) => {
    const normalized = normalizeColumnOrder(
      next,
      PRODUCT_PROFITABILITY_COLUMN_IDS,
      PRODUCT_PROFITABILITY_DEFAULT_COLUMN_ORDER,
    );
    setColumnOrder(normalized);
    saveColumnLayout(PRODUCT_PROFITABILITY_COLUMNS_LAYOUT_KEY, normalized);
  }, []);

  return { columnOrder, persistColumnOrder };
}
