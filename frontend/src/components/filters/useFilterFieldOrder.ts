import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadVisibleFieldOrder, saveVisibleFieldOrder } from "./filterVisibilityStorage";

/**
 * Ordered list of visible filter field ids for a page; persisted automatically.
 * @param storageKey short id e.g. `orders.list` (prefixed internally)
 * @param catalogIds stable ordered ids of all known fields
 */
export function useFilterFieldOrder(
  storageKey: string,
  catalogIds: readonly string[],
  defaultVisibleIds?: readonly string[],
) {
  console.log("[HOOK] useFilterFieldOrder init", { storageKey, n: catalogIds.length });
  const catalogKey = useMemo(() => catalogIds.join("\0"), [catalogIds]);
  const defaultKey = useMemo(() => defaultVisibleIds?.join("\0") ?? "", [defaultVisibleIds]);
  /** Avoid effect re-running every render when callers pass a new array instance with the same ids. */
  const catalogIdsRef = useRef(catalogIds);
  catalogIdsRef.current = catalogIds;
  const defaultVisibleRef = useRef(defaultVisibleIds);
  defaultVisibleRef.current = defaultVisibleIds;

  const [order, setOrder] = useState<string[]>(() =>
    loadVisibleFieldOrder(storageKey, catalogIds, defaultVisibleIds),
  );

  useEffect(() => {
    setOrder(loadVisibleFieldOrder(storageKey, catalogIdsRef.current, defaultVisibleRef.current));
  }, [storageKey, catalogKey, defaultKey]);

  useEffect(() => {
    console.log("[HOOK] usePreferences persist", { storageKey, rawLen: order.length, orderPreview: order.slice(0, 12) });
    saveVisibleFieldOrder(storageKey, order);
  }, [storageKey, order]);

  const setOrderFromModal = useCallback((next: string[]) => {
    const valid = new Set(catalogIds);
    const dedup: string[] = [];
    for (const id of next) {
      if (valid.has(id) && !dedup.includes(id)) dedup.push(id);
    }
    setOrder(dedup.length === 0 ? [...catalogIds] : dedup);
  }, [catalogIds]);

  const isVisible = useCallback((id: string) => order.includes(id), [order]);

  return { order, setOrder, setOrderFromModal, isVisible };
}
