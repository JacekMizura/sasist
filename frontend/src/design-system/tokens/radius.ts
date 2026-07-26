/**
 * Radius scale — single source. Prefer these over raw rounded-*.
 *
 * sm  → 6px  (chips, dense icon)
 * md  → 8px  (Primary, ERP controls)
 * lg  → 12px (Card, Secondary card, Segmented)
 * xl  → 16px (large panels)
 */

export const radius = {
  none: "rounded-none",
  sm: "rounded-md", // ~6px
  md: "rounded-lg", // ~8px
  lg: "rounded-xl", // ~12px
  xl: "rounded-2xl", // ~16px
  full: "rounded-full",
} as const;

export type RadiusToken = keyof typeof radius;
