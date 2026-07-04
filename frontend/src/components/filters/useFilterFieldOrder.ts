import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadVisibleFieldOrder, saveVisibleFieldOrder } from "./filterVisibilityStorage";

type ControlledFieldOrder = {
  order: string[];
  onChange: (next: string[]) => void;
};

/**
 * Ordered list of visible filter field ids.
 * When `controlled` is passed, persistence is delegated to list view state (no localStorage writes).
 */
export function useFilterFieldOrder(
  storageKey: string,
  catalogIds: readonly string[],
  defaultVisibleIds?: readonly string[],
  controlled?: ControlledFieldOrder,
) {
  const catalogKey = useMemo(() => catalogIds.join("\0"), [catalogIds]);
  const defaultKey = useMemo(() => defaultVisibleIds?.join("\0") ?? "", [defaultVisibleIds]);
  const catalogIdsRef = useRef(catalogIds);
  catalogIdsRef.current = catalogIds;
  const defaultVisibleRef = useRef(defaultVisibleIds);
  defaultVisibleRef.current = defaultVisibleIds;

  const [internalOrder, setInternalOrder] = useState<string[]>(() =>
    loadVisibleFieldOrder(storageKey, catalogIds, defaultVisibleIds),
  );

  useEffect(() => {
    if (controlled) return;
    setInternalOrder(loadVisibleFieldOrder(storageKey, catalogIdsRef.current, defaultVisibleRef.current));
  }, [storageKey, catalogKey, defaultKey, controlled]);

  useEffect(() => {
    if (controlled) return;
    saveVisibleFieldOrder(storageKey, internalOrder);
  }, [storageKey, internalOrder, controlled]);

  const setOrderFromModal = useCallback(
    (next: string[]) => {
      const valid = new Set(catalogIds);
      const dedup: string[] = [];
      for (const id of next) {
        if (valid.has(id) && !dedup.includes(id)) dedup.push(id);
      }
      const normalized = dedup.length === 0 ? [...catalogIds] : dedup;
      if (controlled) {
        controlled.onChange(normalized);
        return;
      }
      setInternalOrder(normalized);
    },
    [catalogIds, controlled],
  );

  const order = controlled?.order ?? internalOrder;
  const isVisible = useCallback((id: string) => order.includes(id), [order]);

  return { order, setOrder: controlled ? controlled.onChange : setInternalOrder, setOrderFromModal, isVisible };
}
