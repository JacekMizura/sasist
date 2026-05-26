/** Level-of-detail for rack ID labels on the map (driven by user zoom multiplier, not CSS scale). */

export type RackLabelLodLevel = "low" | "medium" | "high";

/** Thresholds: overview → sparse → full labels. */
export function getRackLabelLodLevel(userZoom: number): RackLabelLodLevel {
  if (userZoom < 0.5) return "low";
  if (userZoom < 1.2) return "medium";
  return "high";
}

/** Fade labels slightly when zoomed out; stronger when zoomed in. */
export function rackLabelOpacityForZoom(userZoom: number): number {
  return Math.min(1, Math.max(0.42, 0.38 + userZoom * 0.48));
}

/** Medium LOD: show every Nth rack (0-based order within row prefix), sorted by Y then X. */
export const RACK_LABEL_MEDIUM_STRIDE = 5;
