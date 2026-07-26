import type { WarehouseMode } from "../WarehouseModeContext";

/**
 * Thin feature registry — documents which capabilities belong to which mode.
 * v1: IDs only (panels still composed in WarehouseDesigner slots).
 * Future modes (e.g. routing as top-level) add an entry here without rebuilding Shell/Canvas.
 */
export type WarehouseFeatureId =
  | "live.dashboard"
  | "live.products"
  | "live.occupancy"
  | "designer.catalog"
  | "designer.tools"
  | "designer.routing"; // designer-internal workspace — not a top-level mode

export const FEATURES_BY_MODE: Record<WarehouseMode, readonly WarehouseFeatureId[]> = {
  live: ["live.dashboard", "live.products", "live.occupancy"],
  designer: ["designer.catalog", "designer.tools", "designer.routing"],
};

export function featuresForMode(mode: WarehouseMode): readonly WarehouseFeatureId[] {
  return FEATURES_BY_MODE[mode];
}
