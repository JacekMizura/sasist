import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PanelBulkSelectionMode = "none" | "filtered_all" | "explicit";

export type UsePanelListBulkSelectionOptions = {
  /** Ids in display order (e.g. current page / filtered rows). */
  visibleIds: string[];
  /** When any dependency changes, selection is cleared (e.g. page, filter). */
  clearOnDeps?: ReadonlyArray<unknown>;
  /**
   * Total rows matching current server filters (e.g. X-Total-Count).
   * When omitted, „Pasujące do filtrów” is unavailable (returns only page/explicit).
   */
  serverFilteredTotal?: number | null;
};

/**
 * Shared selection model for panel lists (orders / returns): string ids,
 * select-all on visible rows, optional shift-range add, optional „all matching filters”.
 */
export function usePanelListBulkSelection({
  visibleIds,
  clearOnDeps = [],
  serverFilteredTotal = null,
}: UsePanelListBulkSelectionOptions) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkSelectionMode, setBulkSelectionMode] = useState<PanelBulkSelectionMode>("none");
  const lastAnchorRef = useRef<string | null>(null);

  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  const effectiveSelectionCount = useMemo(() => {
    if (bulkSelectionMode === "filtered_all" && serverFilteredTotal != null) return serverFilteredTotal;
    return selectedIds.length;
  }, [bulkSelectionMode, serverFilteredTotal, selectedIds.length]);

  useEffect(() => {
    setSelectedIds([]);
    setBulkSelectionMode("none");
    lastAnchorRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls reset keys
  }, clearOnDeps);

  useEffect(() => {
    if (bulkSelectionMode === "filtered_all") return;
    setSelectedIds((prev) => {
      const next = prev.filter((id) => visibleSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [visibleSet, bulkSelectionMode]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setBulkSelectionMode("none");
    lastAnchorRef.current = null;
  }, []);

  const selectAllFiltered = useCallback(() => {
    if (serverFilteredTotal == null || serverFilteredTotal < 1) return;
    setBulkSelectionMode("filtered_all");
    setSelectedIds([]);
    lastAnchorRef.current = null;
  }, [serverFilteredTotal]);

  const selectAllOnPage = useCallback(() => {
    setBulkSelectionMode("explicit");
    setSelectedIds([...visibleIds]);
    lastAnchorRef.current = visibleIds.length ? visibleIds[visibleIds.length - 1]! : null;
  }, [visibleIds]);

  /** Zastępuje zaznaczenie pojedynczym id (np. akcja z wiersza). */
  const selectOnly = useCallback((id: string) => {
    setBulkSelectionMode("explicit");
    setSelectedIds([id]);
    lastAnchorRef.current = id;
  }, []);

  const toggleOne = useCallback(
    (id: string, shiftKey?: boolean) => {
      if (bulkSelectionMode === "filtered_all") {
        setBulkSelectionMode("explicit");
        lastAnchorRef.current = id;
        setSelectedIds([id]);
        return;
      }
      if (shiftKey && lastAnchorRef.current) {
        const a = visibleIds.indexOf(lastAnchorRef.current);
        const b = visibleIds.indexOf(id);
        if (a >= 0 && b >= 0) {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const range = visibleIds.slice(lo, hi + 1);
          setSelectedIds((prev) => Array.from(new Set([...prev, ...range])));
          lastAnchorRef.current = id;
          return;
        }
      }
      setBulkSelectionMode("explicit");
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      lastAnchorRef.current = id;
    },
    [visibleIds, bulkSelectionMode],
  );

  const toggleAllVisible = useCallback(() => {
    if (bulkSelectionMode === "filtered_all") {
      selectAllOnPage();
      return;
    }
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
    setBulkSelectionMode("explicit");
  }, [visibleIds, visibleSet, selectedIds, bulkSelectionMode, selectAllOnPage]);

  useEffect(() => {
    if (bulkSelectionMode === "explicit" && selectedIds.length === 0) {
      setBulkSelectionMode("none");
    }
  }, [bulkSelectionMode, selectedIds.length]);

  const headerChecked =
    bulkSelectionMode === "filtered_all" ||
    (visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id)));
  const headerIndeterminate =
    bulkSelectionMode === "explicit" &&
    visibleIds.length > 0 &&
    visibleIds.some((id) => selectedIds.includes(id)) &&
    !headerChecked;

  const isRowSelected = useCallback(
    (id: string) => bulkSelectionMode === "filtered_all" || selectedIds.includes(id),
    [bulkSelectionMode, selectedIds],
  );

  return {
    selectedIds,
    bulkSelectionMode,
    effectiveSelectionCount,
    selectAllFiltered,
    selectAllOnPage,
    toggleOne,
    toggleAllVisible,
    clearSelection,
    selectOnly,
    headerChecked,
    headerIndeterminate,
    isRowSelected,
  };
}
