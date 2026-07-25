import type { ButtonHTMLAttributes } from "react";

import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { filterToolbarBtnGhost, filterToolbarBtnSecondary } from "../filters/filterUiTokens";

export type AppButtonVariant = "primary" | "secondary" | "success" | "ghost";

const VARIANT_CLASS: Record<AppButtonVariant, string> = {
  /** Brand Primary CTA (orange) — global Design System. */
  primary: brandPrimaryButtonClass,
  secondary: filterToolbarBtnSecondary,
  success:
    "inline-flex h-10 items-center justify-center rounded-lg bg-emerald-700 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
  ghost: filterToolbarBtnGhost,
};

export type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
};

/** Shared button. `primary` = brand orange CTA. Secondary / success / ghost unchanged in role. */
export function AppButton({ variant = "secondary", className = "", type = "button", ...props }: AppButtonProps) {
  return (
    <button
      type={type}
      className={`${VARIANT_CLASS[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
