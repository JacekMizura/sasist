/**
 * Orchestrates layout interactions: snap config, validation, layers.
 * Keeps logic separate from rendering.
 */
import { useCallback, useMemo, useState } from "react";
import type { SnapConfig } from "./SnapEngine";
import type { ValidationConstraints, ValidationResult } from "./ValidationEngine";
import { validateLayout } from "./ValidationEngine";
import type { LayerManagerState } from "./LayerManager";
import { createLayerManagerState, toggleLayer } from "./LayerManager";

const DEFAULT_SNAP_CONFIG: SnapConfig = {
  snapToGrid: true,
  snapToObjects: true,
  snapToAxis: true,
  gridStep: 1,
  snapThreshold: 0.5,
};

export function useLayoutInteractions(options?: {
  initialSnap?: Partial<SnapConfig>;
  initialLayers?: Partial<LayerManagerState>;
}) {
  const [snapConfig, setSnapConfig] = useState<SnapConfig>({
    ...DEFAULT_SNAP_CONFIG,
    ...options?.initialSnap,
  });
  const [layers, setLayers] = useState<LayerManagerState>(
    createLayerManagerState(options?.initialLayers)
  );

  const setSnapToGrid = useCallback((v: boolean) => {
    setSnapConfig((c) => ({ ...c, snapToGrid: v }));
  }, []);
  const setSnapToObjects = useCallback((v: boolean) => {
    setSnapConfig((c) => ({ ...c, snapToObjects: v }));
  }, []);
  const setSnapToAxis = useCallback((v: boolean) => {
    setSnapConfig((c) => ({ ...c, snapToAxis: v }));
  }, []);

  const toggleLayerCallback = useCallback((layer: keyof LayerManagerState) => {
    setLayers((s) => toggleLayer(s, layer));
  }, []);

  const runValidation = useCallback(
    (constraints: ValidationConstraints, context: Parameters<typeof validateLayout>[1]): ValidationResult => {
      return validateLayout(constraints, context);
    },
    []
  );

  return useMemo(
    () => ({
      snapConfig,
      setSnapConfig,
      setSnapToGrid,
      setSnapToObjects,
      setSnapToAxis,
      layers,
      setLayers,
      toggleLayer: toggleLayerCallback,
      runValidation,
    }),
    [
      snapConfig,
      setSnapToGrid,
      setSnapToObjects,
      setSnapToAxis,
      layers,
      toggleLayerCallback,
      runValidation,
    ]
  );
}
