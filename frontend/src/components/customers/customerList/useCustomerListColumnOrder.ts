import { useCallback, useState } from "react";

import {
  loadColumnLayout,
  normalizeColumnOrder,
  saveColumnLayout,
} from "../../../preferences/columnLayoutPreferences";
import {
  CUSTOMERS_LIST_COLUMNS_LAYOUT_KEY,
  CUSTOMER_LIST_COLUMN_IDS,
  CUSTOMER_LIST_DEFAULT_COLUMN_ORDER,
} from "./customerListColumnCatalog";

export function useCustomerListColumnOrder() {
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    loadColumnLayout(
      CUSTOMERS_LIST_COLUMNS_LAYOUT_KEY,
      CUSTOMER_LIST_COLUMN_IDS,
      CUSTOMER_LIST_DEFAULT_COLUMN_ORDER,
    ),
  );

  const persistColumnOrder = useCallback((next: string[]) => {
    const normalized = normalizeColumnOrder(next, CUSTOMER_LIST_COLUMN_IDS, CUSTOMER_LIST_DEFAULT_COLUMN_ORDER);
    setColumnOrder(normalized);
    saveColumnLayout(CUSTOMERS_LIST_COLUMNS_LAYOUT_KEY, normalized);
  }, []);

  return { columnOrder, persistColumnOrder };
}
