/**
 * Central layout designer mode. Only one active at a time.
 * Used for toolbar highlight, cursor, and disabling incompatible interactions.
 */
export const LayoutMode = {
  SELECT: "SELECT",
  DRAW_ROW: "DRAW_ROW",
  DRAW_AISLE: "DRAW_AISLE",
  PATH_TOOL: "PATH_TOOL",
  EDIT: "EDIT",
  ANALYSIS: "ANALYSIS",
} as const;

export type LayoutMode = (typeof LayoutMode)[keyof typeof LayoutMode];

export const LAYOUT_MODE_LABELS: Record<LayoutMode, string> = {
  [LayoutMode.SELECT]: "Select",
  [LayoutMode.DRAW_ROW]: "Draw Row",
  [LayoutMode.DRAW_AISLE]: "Draw Aisle",
  [LayoutMode.PATH_TOOL]: "Path Tool",
  [LayoutMode.EDIT]: "Edit",
  [LayoutMode.ANALYSIS]: "Analysis",
};

/** Color for mode badge (tailwind-like hex). */
export const LAYOUT_MODE_COLORS: Record<LayoutMode, string> = {
  [LayoutMode.SELECT]: "#64748b",
  [LayoutMode.DRAW_ROW]: "#0891b2",
  [LayoutMode.DRAW_AISLE]: "#0d9488",
  [LayoutMode.PATH_TOOL]: "#7c3aed",
  [LayoutMode.EDIT]: "#ca8a04",
  [LayoutMode.ANALYSIS]: "#dc2626",
};

export const LAYOUT_MODE_SHORTCUTS: Record<LayoutMode, string> = {
  [LayoutMode.SELECT]: "S",
  [LayoutMode.DRAW_ROW]: "R",
  [LayoutMode.DRAW_AISLE]: "A",
  [LayoutMode.PATH_TOOL]: "P",
  [LayoutMode.EDIT]: "E",
  [LayoutMode.ANALYSIS]: "V",
};

/** Cursor style per mode for canvas interaction. */
export const LAYOUT_MODE_CURSORS: Record<LayoutMode, string> = {
  [LayoutMode.SELECT]: "default",
  [LayoutMode.DRAW_ROW]: "crosshair",
  [LayoutMode.DRAW_AISLE]: "col-resize",
  [LayoutMode.PATH_TOOL]: "pointer",
  [LayoutMode.EDIT]: "move",
  [LayoutMode.ANALYSIS]: "default",
};
