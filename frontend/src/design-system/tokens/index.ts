/**
 * Sasist UI Kit — design tokens barrel.
 */

export { colors, toneTextClass, toneSoftBgClass, toneBadgeClass, type ColorTone } from "./colors";
export { space, spacing } from "./spacing";
export { radius, type RadiusToken } from "./radius";
export { typography } from "./typography";
export { shadows } from "./shadows";
export { sizes, controlHeightClass, type ControlSize } from "./sizes";
export { motion } from "./motion";
export { zIndex } from "./zIndex";
export {
  DENSITY_DEFAULT,
  densityControlHeight,
  densityIconSize,
  densityButtonPx,
  densityFieldPad,
  densitySegmentPy,
  densityCardPad,
  densityControlText,
  type UiDensity,
} from "./density";

import { colors } from "./colors";

/** Shared focus ring fragments — always from color tokens (dark-mode ready). */
export const focus = {
  brand: `focus:outline-none focus-visible:ring-2 ${colors.primary.focusRing} focus-visible:ring-offset-2`,
  brandSoft: `focus:outline-none focus-visible:ring-2 ${colors.primary.focusRing}/40`,
  neutral: `focus:outline-none focus-visible:ring-1 ${colors.neutral.focusRing}`,
  danger: `focus:outline-none focus-visible:ring-2 ${colors.danger.focusRing} focus-visible:ring-offset-2`,
} as const;
