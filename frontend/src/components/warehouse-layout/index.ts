/**
 * Barrel: re-eksport z src/warehouse-layout, żeby import "../warehouse-layout"
 * z components/warehouse/ działał bez błędów Vite.
 */
export {
  LayoutMode,
  LAYOUT_MODE_LABELS,
  LAYOUT_MODE_COLORS,
  LAYOUT_MODE_SHORTCUTS,
  LAYOUT_MODE_CURSORS,
} from "../../warehouse-layout";
export { useLayoutModeShortcuts, useLayoutModeDisplay } from "../../warehouse-layout";
export type { LayoutModeState, LayoutModeDisplay } from "../../warehouse-layout";
export { LayoutModeBadge } from "../../warehouse-layout";
export type { LayoutModeBadgeProps } from "../../warehouse-layout";
export { snapPosition } from "../../warehouse-layout";
export type { SnapConfig, SnapResult, Rect } from "../../warehouse-layout";
export { validateLayout } from "../../warehouse-layout";
export type { ValidationConstraints, ValidationViolation, ValidationResult } from "../../warehouse-layout";
export { createLayerManagerState, toggleLayer, DEFAULT_LAYERS } from "../../warehouse-layout";
export type { LayoutLayerId, LayerManagerState } from "../../warehouse-layout";
export { useLayoutInteractions } from "../../warehouse-layout";
