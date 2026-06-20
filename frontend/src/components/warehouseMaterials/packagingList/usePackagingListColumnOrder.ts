import { useCallback, useState } from "react";

import {
  loadColumnLayout,
  normalizeColumnOrder,
  saveColumnLayout,
} from "../../../preferences/columnLayoutPreferences";
import {
  PACKAGING_LIST_COLUMN_IDS,
  PACKAGING_LIST_COLUMNS_LAYOUT_KEY,
  PACKAGING_LIST_DEFAULT_COLUMN_ORDER,
} from "./packagingListColumnCatalog";

export function usePackagingListColumnOrder() {
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    loadColumnLayout(PACKAGING_LIST_COLUMNS_LAYOUT_KEY, PACKAGING_LIST_COLUMN_IDS, PACKAGING_LIST_DEFAULT_COLUMN_ORDER),
  );

  const persistColumnOrder = useCallback((next: string[]) => {
    const normalized = normalizeColumnOrder(next, PACKAGING_LIST_COLUMN_IDS, PACKAGING_LIST_DEFAULT_COLUMN_ORDER);
    setColumnOrder(normalized);
    saveColumnLayout(PACKAGING_LIST_COLUMNS_LAYOUT_KEY, normalized);
  }, []);

  return { columnOrder, persistColumnOrder };
}
