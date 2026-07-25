/**
 * Extensible Magazyn map visualization modes (UX only — no data filtering).
 * Add new modes in {@link MAP_VISUALIZATION_MODES}; wire opacity in {@link locationDimOpacity}.
 */

export type MapVisualizationModeId =
  | "all"
  | "occupied"
  | "free"
  /** Reserved for future layers — register in MAP_VISUALIZATION_MODES when ready. */
  | "reservations"
  | "damaged"
  | "production"
  | "cross_dock"
  | "inbound"
  | "outbound"
  | "inventory"
  | "putaway"
  | "replenishment"
  | "heatmap_rotation"
  | "heatmap_occupancy"
  | "abc"
  | "xyz";

export type MapVisualizationModeKind = "presence" | "category" | "heatmap";

export type MapVisualizationModeDefinition = {
  id: MapVisualizationModeId;
  /** Panel label (Polish). */
  label: string;
  kind: MapVisualizationModeKind;
  /** When false, mode is hidden from the Lokalizacje panel but remains in the registry. */
  panelVisible: boolean;
  /** Optional count key from MagazynDashboardPanel locationFill / future metrics. */
  countKey?: "occupied" | "free" | "total";
};

/** Opacity applied to locations that should appear dimmed (non-matching). */
export const MAP_VIZ_DIM_OPACITY = 0.42;

/** Opacity for locations that stay in focus for the active mode. */
export const MAP_VIZ_FOCUS_OPACITY = 1;

/**
 * Registry — extend here to add modes. Panel lists only `panelVisible` entries.
 */
export const MAP_VISUALIZATION_MODES: readonly MapVisualizationModeDefinition[] = [
  { id: "all", label: "Wszystkie", kind: "presence", panelVisible: true, countKey: "total" },
  { id: "occupied", label: "Zajęte", kind: "presence", panelVisible: true, countKey: "occupied" },
  { id: "free", label: "Wolne", kind: "presence", panelVisible: true, countKey: "free" },
  // Future (panelVisible: false until product-ready):
  { id: "reservations", label: "Rezerwacje", kind: "category", panelVisible: false },
  { id: "damaged", label: "Uszkodzone", kind: "category", panelVisible: false },
  { id: "production", label: "Produkcja", kind: "category", panelVisible: false },
  { id: "cross_dock", label: "Cross Dock", kind: "category", panelVisible: false },
  { id: "inbound", label: "Przyjęcia", kind: "category", panelVisible: false },
  { id: "outbound", label: "Wysyłka", kind: "category", panelVisible: false },
  { id: "inventory", label: "Inwentaryzacja", kind: "category", panelVisible: false },
  { id: "putaway", label: "Putaway", kind: "category", panelVisible: false },
  { id: "replenishment", label: "Replenishment", kind: "category", panelVisible: false },
  { id: "heatmap_rotation", label: "Heatmapa rotacji", kind: "heatmap", panelVisible: false },
  { id: "heatmap_occupancy", label: "Heatmapa zajętości", kind: "heatmap", panelVisible: false },
  { id: "abc", label: "ABC", kind: "heatmap", panelVisible: false },
  { id: "xyz", label: "XYZ", kind: "heatmap", panelVisible: false },
] as const;

export const DEFAULT_MAP_VISUALIZATION_MODE: MapVisualizationModeId = "all";

export function getMapVisualizationMode(
  id: MapVisualizationModeId
): MapVisualizationModeDefinition | undefined {
  return MAP_VISUALIZATION_MODES.find((m) => m.id === id);
}

export function listPanelMapVisualizationModes(): MapVisualizationModeDefinition[] {
  return MAP_VISUALIZATION_MODES.filter((m) => m.panelVisible);
}

/**
 * Whether a location should be dimmed for the active mode.
 * Presence modes use occupied/free; future modes plug in via {@link locationMatchesMode}.
 */
export function locationMatchesMode(
  mode: MapVisualizationModeId,
  context: { occupied: boolean }
): boolean {
  switch (mode) {
    case "all":
      return true;
    case "occupied":
      return context.occupied;
    case "free":
      return !context.occupied;
    default:
      // Future modes: treat as "all" until a matcher is implemented (no accidental dimming).
      return true;
  }
}

/** Final SVG opacity for a location under the active visualization mode. */
export function locationDimOpacity(
  mode: MapVisualizationModeId,
  context: { occupied: boolean }
): number {
  if (mode === "all") return MAP_VIZ_FOCUS_OPACITY;
  return locationMatchesMode(mode, context) ? MAP_VIZ_FOCUS_OPACITY : MAP_VIZ_DIM_OPACITY;
}

export function isMapVisualizationActive(mode: MapVisualizationModeId): boolean {
  return mode !== "all" && locationMatchesMode(mode, { occupied: true }) !== locationMatchesMode(mode, { occupied: false });
}
