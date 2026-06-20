import type { ButtonHTMLAttributes } from "react";

import {
  filterToolbarBtnGhost,
  filterToolbarBtnPrimary,
  filterToolbarBtnSecondary,
} from "../filters/filterUiTokens";

export type AppButtonVariant = "primary" | "secondary" | "success" | "ghost";

const VARIANT_CLASS: Record<AppButtonVariant, string> = {
  primary: filterToolbarBtnPrimary,
  secondary: filterToolbarBtnSecondary,
  success:
    "inline-flex h-[2.375rem] items-center justify-center rounded-md bg-emerald-700 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1",
  ghost: filterToolbarBtnGhost,
};

export type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
};

export function AppButton({ variant = "secondary", className = "", type = "button", ...props }: AppButtonProps) {
  return (
    <button
      type={type}
      className={`${VARIANT_CLASS[variant]} disabled:pointer-events-none disabled:opacity-50 ${className}`.trim()}
      {...props}
    />
  );
}
