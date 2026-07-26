/**
 * Control / hit-area sizes.
 */

export const sizes = {
  /** ERP primary / page CTA */
  controlLg: "h-10",
  /** Dense filters / toolbars (~38px) */
  controlMd: "h-[2.375rem]",
  /** Compact list filters */
  controlSm: "h-9",
  /** Icon square md */
  iconMd: "h-9 w-9",
  /** Icon square sm */
  iconSm: "h-8 w-8",
  /** Designer left rail width */
  railWidth: "w-[300px]",
} as const;

export type ControlSize = "sm" | "md" | "lg";

export function controlHeightClass(size: ControlSize = "lg"): string {
  if (size === "sm") return sizes.controlSm;
  if (size === "md") return sizes.controlMd;
  return sizes.controlLg;
}
