/**
 * Warehouse / Designer chrome helpers — composition of Sasist UI Kit tokens.
 * Prefer Card / SegmentedControl / Input / SearchInput in new JSX; these class
 * strings remain for dense map chrome until full JSX migration.
 */

import { colors, radius, shadows, sizes, spacing, typography } from "./tokens";
import { cardButtonClass } from "./components/Button/buttonClasses";
import { cardClassName } from "./components/Card";
import { inputClassName } from "./components/Input";

export const warehouseRailBgClass = colors.surface.page;

export const warehouseLeftRailClass = [
  "box-border flex h-full min-h-0 flex-none flex-col self-stretch overflow-x-hidden overflow-y-auto overscroll-y-contain",
  "border-r",
  colors.border.default,
  colors.surface.page,
  spacing.rail,
  sizes.railWidth,
].join(" ");

export const warehouseRightRailShellClass = [colors.surface.page, shadows.rail].join(" ");

export const warehouseSectionLabelClass = typography.section;

export const warehouseSearchInputClass = inputClassName("comfortable", "brand");

export const warehouseFieldClass = inputClassName("default", "brand");

export const warehouseCardClass = cardClassName("rail");

export const warehouseListTileClass = cardClassName("listTile");

export const warehouseListTileSelectedClass = cardClassName("listTile", { selected: true });

/** @deprecated Prefer CardButton. */
export const warehousePrimaryActionClass = cardButtonClass({ fullWidth: true });

/** @deprecated Prefer CardButton. */
export const warehouseSecondaryActionClass = cardButtonClass({ fullWidth: true });

export const warehouseSegmentShellClass = [
  "mb-3 flex shrink-0",
  radius.lg,
  "bg-white/80 p-0.5",
  shadows.sm,
  "ring-1 ring-slate-200/60",
].join(" ");

export const warehouseSegmentBtnClass = (active: boolean) =>
  [
    "flex-1",
    radius.md,
    "py-1.5 text-[11px] font-medium transition-colors",
    active
      ? `${colors.surface.page} text-slate-900 ${shadows.sm} ring-1 ring-slate-200/70`
      : "text-slate-600 hover:text-slate-800",
  ].join(" ");

export const warehouseMapSurroundClass =
  `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${colors.surface.canvas}`;

export const warehouseToolGroupClass = [
  "flex items-center gap-1",
  radius.lg,
  "border-0 bg-white/90 p-0.5",
  shadows.sm,
  "ring-1 ring-slate-200/70",
].join(" ");

