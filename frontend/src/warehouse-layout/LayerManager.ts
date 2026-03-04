/**
 * Toggleable visual layers state. UI state only; rendering reads these flags.
 */

export type LayoutLayerId =
  | "grid"
  | "dimensions"
  | "labels"
  | "aisle_directions"
  | "validation_warnings"
  | "occupancy_heatmap";

export type LayerManagerState = Record<LayoutLayerId, boolean>;

export const DEFAULT_LAYERS: LayerManagerState = {
  grid: true,
  dimensions: false,
  labels: true,
  aisle_directions: false,
  validation_warnings: true,
  occupancy_heatmap: false,
};

export function createLayerManagerState(overrides?: Partial<LayerManagerState>): LayerManagerState {
  return { ...DEFAULT_LAYERS, ...overrides };
}

export function toggleLayer(state: LayerManagerState, layer: LayoutLayerId): LayerManagerState {
  return { ...state, [layer]: !state[layer] };
}
