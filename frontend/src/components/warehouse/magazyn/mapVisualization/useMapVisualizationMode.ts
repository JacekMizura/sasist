import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_MAP_VISUALIZATION_MODE,
  type MapVisualizationModeId,
  getMapVisualizationMode,
} from "./MapVisualizationMode";

const STORAGE_PREFIX = "warehouse_map_viz_mode_v1_";

function storageKey(warehouseId: number): string {
  return `${STORAGE_PREFIX}${warehouseId}`;
}

function readStoredMode(warehouseId: number | null): MapVisualizationModeId {
  if (warehouseId == null || typeof window === "undefined") return DEFAULT_MAP_VISUALIZATION_MODE;
  try {
    const raw = localStorage.getItem(storageKey(warehouseId));
    if (raw == null) return DEFAULT_MAP_VISUALIZATION_MODE;
    const def = getMapVisualizationMode(raw as MapVisualizationModeId);
    return def?.panelVisible ? def.id : DEFAULT_MAP_VISUALIZATION_MODE;
  } catch {
    return DEFAULT_MAP_VISUALIZATION_MODE;
  }
}

/**
 * Active map visualization mode (UX overlay). Persisted per warehouseId.
 */
export function useMapVisualizationMode(warehouseId: number | null) {
  const [mode, setModeRaw] = useState<MapVisualizationModeId>(DEFAULT_MAP_VISUALIZATION_MODE);

  useEffect(() => {
    setModeRaw(readStoredMode(warehouseId));
  }, [warehouseId]);

  const setMode = useCallback(
    (next: MapVisualizationModeId) => {
      const def = getMapVisualizationMode(next);
      const id = def?.panelVisible ? def.id : DEFAULT_MAP_VISUALIZATION_MODE;
      setModeRaw(id);
      if (warehouseId == null || typeof window === "undefined") return;
      try {
        localStorage.setItem(storageKey(warehouseId), id);
      } catch {
        /* quota / private mode */
      }
    },
    [warehouseId]
  );

  return { mode, setMode };
}
