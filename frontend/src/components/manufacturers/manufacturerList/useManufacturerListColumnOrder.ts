import { useCallback, useState } from "react";

import {
  loadColumnLayout,
  normalizeColumnOrder,
  saveColumnLayout,
} from "../../../preferences/columnLayoutPreferences";
import {
  MANUFACTURERS_LIST_COLUMNS_LAYOUT_KEY,
  MANUFACTURER_LIST_COLUMN_IDS,
  MANUFACTURER_LIST_DEFAULT_COLUMN_ORDER,
} from "./manufacturerListColumnCatalog";

export function useManufacturerListColumnOrder() {
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    loadColumnLayout(
      MANUFACTURERS_LIST_COLUMNS_LAYOUT_KEY,
      MANUFACTURER_LIST_COLUMN_IDS,
      MANUFACTURER_LIST_DEFAULT_COLUMN_ORDER,
    ),
  );

  const persistColumnOrder = useCallback((next: string[]) => {
    const normalized = normalizeColumnOrder(
      next,
      MANUFACTURER_LIST_COLUMN_IDS,
      MANUFACTURER_LIST_DEFAULT_COLUMN_ORDER,
    );
    setColumnOrder(normalized);
    saveColumnLayout(MANUFACTURERS_LIST_COLUMNS_LAYOUT_KEY, normalized);
  }, []);

  return { columnOrder, persistColumnOrder };
}
