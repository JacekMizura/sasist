/**
 * Single source of truth for mapping warehouse floor (meters) ↔ layout grid (cells).
 * When `building_width_m` / depth are set, each axis may have different meters per cell (non-square cells).
 * Fallback: legacy 10 cm per cell (GRID_UNIT_CM).
 */

import type { LayoutState } from "../types/warehouse";
import { GRID_UNIT_CM } from "../types/warehouse";

export type LayoutMetersPerCell = {
  metersPerCellX: number;
  metersPerCellY: number;
};

/** `building_width_m / grid_cols`, `building_depth_m / grid_rows` (depth from `building_depth_m ?? building_height_m`). */
export function getLayoutMetersPerCell(
  layout: Pick<LayoutState, "grid_cols" | "grid_rows" | "building_width_m" | "building_depth_m" | "building_height_m">
): LayoutMetersPerCell | null {
  const bw = layout.building_width_m;
  const depthM = layout.building_depth_m ?? layout.building_height_m;
  const { grid_cols: gc, grid_rows: gr } = layout;
  if (bw == null || depthM == null || bw <= 0 || depthM <= 0 || gc <= 0 || gr <= 0) {
    return null;
  }
  return {
    metersPerCellX: bw / gc,
    metersPerCellY: depthM / gr,
  };
}

function legacyCmToCells(cm: number): number {
  return Math.round(cm / GRID_UNIT_CM);
}

/** Physical extent along layout X (width) in cm → cell count. */
export function layoutCmToCellsX(
  layout: Pick<LayoutState, "grid_cols" | "grid_rows" | "building_width_m" | "building_depth_m" | "building_height_m">,
  cm: number
): number {
  const mpc = getLayoutMetersPerCell(layout);
  if (!mpc) return Math.max(0, legacyCmToCells(cm));
  const meters = cm / 100;
  return Math.max(0, Math.round(meters / mpc.metersPerCellX));
}

/** Physical extent along layout Y (depth) in cm → cell count. */
export function layoutCmToCellsY(
  layout: Pick<LayoutState, "grid_cols" | "grid_rows" | "building_width_m" | "building_depth_m" | "building_height_m">,
  cm: number
): number {
  const mpc = getLayoutMetersPerCell(layout);
  if (!mpc) return Math.max(0, legacyCmToCells(cm));
  const meters = cm / 100;
  return Math.max(0, Math.round(meters / mpc.metersPerCellY));
}

/** Grid span along X → meters (floor width axis). */
export function layoutCellsToMetersX(
  layout: Pick<LayoutState, "grid_cols" | "grid_rows" | "building_width_m" | "building_depth_m" | "building_height_m">,
  cells: number
): number {
  const mpc = getLayoutMetersPerCell(layout);
  if (!mpc) return (cells * GRID_UNIT_CM) / 100;
  return cells * mpc.metersPerCellX;
}

/** Grid span along Y → meters (floor depth axis). */
export function layoutCellsToMetersY(
  layout: Pick<LayoutState, "grid_cols" | "grid_rows" | "building_width_m" | "building_depth_m" | "building_height_m">,
  cells: number
): number {
  const mpc = getLayoutMetersPerCell(layout);
  if (!mpc) return (cells * GRID_UNIT_CM) / 100;
  return cells * mpc.metersPerCellY;
}

/** Optional `metersPerCellX` / `metersPerCellY` from layout (for generators that do not hold full `LayoutState`). */
export function getMetersPerCellFromLayout(
  layout: Pick<LayoutState, "grid_cols" | "grid_rows" | "building_width_m" | "building_depth_m" | "building_height_m">
): { metersPerCellX: number; metersPerCellY: number } | undefined {
  const m = getLayoutMetersPerCell(layout);
  return m ?? undefined;
}
