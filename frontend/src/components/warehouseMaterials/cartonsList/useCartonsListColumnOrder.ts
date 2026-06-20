import { useCallback, useState } from "react";

import {
  loadColumnLayout,
  normalizeColumnOrder,
  saveColumnLayout,
} from "../../../preferences/columnLayoutPreferences";
import {
  CARTONS_LIST_COLUMN_IDS,
  CARTONS_LIST_COLUMNS_LAYOUT_KEY,
  CARTONS_LIST_DEFAULT_COLUMN_ORDER,
} from "./cartonsListColumnCatalog";

export function useCartonsListColumnOrder() {
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    loadColumnLayout(CARTONS_LIST_COLUMNS_LAYOUT_KEY, CARTONS_LIST_COLUMN_IDS, CARTONS_LIST_DEFAULT_COLUMN_ORDER),
  );

  const persistColumnOrder = useCallback((next: string[]) => {
    const normalized = normalizeColumnOrder(next, CARTONS_LIST_COLUMN_IDS, CARTONS_LIST_DEFAULT_COLUMN_ORDER);
    setColumnOrder(normalized);
    saveColumnLayout(CARTONS_LIST_COLUMNS_LAYOUT_KEY, normalized);
  }, []);

  return { columnOrder, persistColumnOrder };
}
