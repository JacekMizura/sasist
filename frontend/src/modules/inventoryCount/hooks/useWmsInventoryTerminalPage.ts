import { useCallback, useEffect, useMemo, useRef } from "react";

import type { InventoryTaskRead } from "@/api/inventoryCountApi";
import {
  buildLiveSearchRows,
  pickFirstLiveSearch,
  useWmsInventoryLiveSearch,
  type LiveSearchPick,
} from "@/modules/inventoryCount/ui/wms/WmsInventoryLiveSearchDropdown";
import { useInventoryScanInput } from "@/modules/inventoryCount/hooks/useInventoryScanInput";
import { useWmsInventoryCountTerminal } from "@/modules/inventoryCount/hooks/useWmsInventoryCountTerminal";
import { isCarrierBarcode } from "@/modules/inventoryCount/wmsInventoryExecutionContext";

/** WMS terminal page orchestration — scan input + live search; counting logic in useWmsInventoryCountTerminal. */
export function useWmsInventoryTerminalPage(
  taskId: number | undefined,
  documentId: number | undefined,
  tenantId: number,
  warehouseId: number | undefined,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickingRef = useRef(false);

  const terminal = useWmsInventoryCountTerminal(taskId, tenantId, warehouseId, documentId);

  const { loading: searchLoading, result, taskMatches, runSearch, clearSearch } = useWmsInventoryLiveSearch(
    tenantId,
    warehouseId ?? 0,
    terminal.task?.inventory_document_id,
    terminal.task?.id,
  );

  const searchRows = useMemo(() => buildLiveSearchRows(result, taskMatches), [result, taskMatches]);
  const counting = Boolean(terminal.task && terminal.locationActive);

  const { query, searchOpen, isScannerMode, onChange, submitScanOnce, closeSearch, clearInput } =
    useInventoryScanInput({
      searchEnabled: counting && !terminal.carrierScanMode,
      isDedicatedScanCode: isCarrierBarcode,
      onScan: terminal.handleScan,
      onSearchQuery: runSearch,
    });

  const searchActive = searchOpen && !isScannerMode && query.trim().length >= 2;

  useEffect(() => {
    if (!searchActive) clearSearch();
  }, [clearSearch, searchActive]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [terminal.locationActive, terminal.task, terminal.carrierScanMode]);

  const applyLivePick = useCallback(
    async (pick: LiveSearchPick) => {
      if (pickingRef.current) return;
      pickingRef.current = true;
      clearInput();
      closeSearch();
      clearSearch();
      try {
        if (pick.kind === "product") await terminal.handleSearchProduct(pick.scanCode);
        else if (pick.kind === "location") await terminal.handleSearchLocation(pick.locationCode, pick.taskId);
        else await terminal.handleSearchCarrier(pick.code);
      } finally {
        pickingRef.current = false;
        inputRef.current?.focus();
      }
    },
    [clearInput, clearSearch, closeSearch, terminal],
  );

  const submitField = useCallback(() => {
    if (searchActive && !searchLoading && !isScannerMode) {
      const first = pickFirstLiveSearch(searchRows);
      if (first) {
        void applyLivePick(first);
        return;
      }
    }
    void submitScanOnce(query);
  }, [applyLivePick, isScannerMode, query, searchActive, searchLoading, searchRows, submitScanOnce]);

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        closeSearch();
        return;
      }
      if (e.key === "Enter" && searchActive && !searchLoading && !isScannerMode) {
        const first = pickFirstLiveSearch(searchRows);
        if (first) {
          e.preventDefault();
          void applyLivePick(first);
        }
      }
    },
    [applyLivePick, closeSearch, isScannerMode, searchActive, searchLoading, searchRows],
  );

  const placeholder = !terminal.locationActive
    ? "Zeskanuj lokalizację"
    : terminal.carrierScanMode
      ? "Zeskanuj nośnik (PAL-…)"
      : "Kod / EAN / SKU / nazwa";

  return {
    inputRef,
    terminal,
    counting,
    query,
    searchActive,
    searchLoading,
    searchRows,
    onChange,
    submitField,
    onInputKeyDown,
    placeholder,
    applyLivePick,
    tenantId,
    warehouseId,
  };
}

export type WmsInventoryTerminalPageState = ReturnType<typeof useWmsInventoryTerminalPage> & {
  task: InventoryTaskRead | null;
};
