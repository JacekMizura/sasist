import { useCallback, useEffect, useState } from "react";

import {
  loadColumnLayout,
  normalizeColumnOrder,
  saveColumnLayout,
} from "../../preferences/columnLayoutPreferences";

type ControlledColumnOrder = {
  order: string[];
  onChange: (next: string[]) => void;
};

/** Shared column layout hook — optional `controlled` mode for `useListViewState`. */
export function useListColumnLayout(
  layoutKey: string,
  columnIds: readonly string[],
  defaultOrder: readonly string[],
  controlled?: ControlledColumnOrder,
  migrate?: (columns: string[]) => string[],
) {
  const normalize = useCallback(
    (next: string[]) => {
      const migrated = migrate ? migrate(next) : next;
      return normalizeColumnOrder(migrated, columnIds, defaultOrder);
    },
    [columnIds, defaultOrder, migrate],
  );

  const [internalOrder, setInternalOrder] = useState<string[]>(() =>
    normalize(loadColumnLayout(layoutKey, columnIds, defaultOrder)),
  );

  useEffect(() => {
    if (controlled) return;
    setInternalOrder(normalize(loadColumnLayout(layoutKey, columnIds, defaultOrder)));
  }, [controlled, layoutKey, columnIds.join("|"), normalize]);

  const persistColumnOrder = useCallback(
    (next: string[]) => {
      const normalized = normalize(next);
      if (controlled) {
        controlled.onChange(normalized);
        return;
      }
      setInternalOrder(normalized);
      saveColumnLayout(layoutKey, normalized);
    },
    [controlled, layoutKey, normalize],
  );

  const columnOrder = controlled?.order ?? internalOrder;

  return { columnOrder, persistColumnOrder };
}
