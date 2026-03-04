/**
 * Design tokens for the layout designer module.
 * Enterprise system look: structured, clear, professional.
 * Grid uses neutral blue-gray; subtle, background-like (does not compete with racks).
 */
const GRID_BASE = "60, 90, 110";

export const colors = {
  background: "#f8fafc",
  gridMinor: `rgba(${GRID_BASE}, 0.02)`,
  gridMajor: `rgba(${GRID_BASE}, 0.05)`,
  gridStrong: `rgba(${GRID_BASE}, 0.08)`,
  overlayBackground: "rgba(255,255,255,0.92)",
  overlayBorder: "rgba(0,0,0,0.05)",
  textPrimary: "#1f2933",
  textSecondary: "#374151",
  rackBorder: "rgba(0,0,0,0.08)",
};

export const shadows = {
  rack: "none",
  rackHover: "none",
  rackDrag: "none",
  overlay: "none",
};

export const radius = {
  small: "6px",
  medium: "8px",
};

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
};
