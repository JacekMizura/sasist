import { useCallback, useState } from "react";

import {
  loadColumnLayout,
  normalizeColumnOrder,
  saveColumnLayout,
} from "../../../preferences/columnLayoutPreferences";
import {
  SUPPLIERS_LIST_COLUMNS_LAYOUT_KEY,
  SUPPLIER_LIST_COLUMN_IDS,
  SUPPLIER_LIST_DEFAULT_COLUMN_ORDER,
} from "./supplierListColumnCatalog";

export function useSupplierListColumnOrder() {
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    loadColumnLayout(
      SUPPLIERS_LIST_COLUMNS_LAYOUT_KEY,
      SUPPLIER_LIST_COLUMN_IDS,
      SUPPLIER_LIST_DEFAULT_COLUMN_ORDER,
    ),
  );

  const persistColumnOrder = useCallback((next: string[]) => {
    const normalized = normalizeColumnOrder(next, SUPPLIER_LIST_COLUMN_IDS, SUPPLIER_LIST_DEFAULT_COLUMN_ORDER);
    setColumnOrder(normalized);
    saveColumnLayout(SUPPLIERS_LIST_COLUMNS_LAYOUT_KEY, normalized);
  }, []);

  return { columnOrder, persistColumnOrder };
}
