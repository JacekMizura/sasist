import type { ButtonHTMLAttributes } from "react";

import { PrimaryButton, type PrimaryButtonProps } from "../../design-system/PrimaryButton";
import { filterToolbarBtnGhost, filterToolbarBtnSecondary } from "../filters/filterUiTokens";

export type AppButtonVariant = "primary" | "secondary" | "success" | "ghost";

const NON_PRIMARY_CLASS: Record<Exclude<AppButtonVariant, "primary">, string> = {
  secondary: filterToolbarBtnSecondary,
  success:
    "inline-flex h-10 items-center justify-center rounded-lg bg-emerald-700 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
  ghost: filterToolbarBtnGhost,
};

export type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
};

/**
 * Shared button. `primary` delegates to {@link PrimaryButton} (Design System — Dodaj użytkownika).
 * Prefer importing {@link PrimaryButton} directly for page CTAs.
 */
export function AppButton({ variant = "secondary", className = "", type = "button", children, ...props }: AppButtonProps) {
  if (variant === "primary") {
    return (
      <PrimaryButton type={type} className={className} {...(props as Omit<PrimaryButtonProps, "children" | "className" | "type">)}>
        {children}
      </PrimaryButton>
    );
  }

  return (
    <button type={type} className={`${NON_PRIMARY_CLASS[variant]}${className ? ` ${className}` : ""}`.trim()} {...props}>
      {children}
    </button>
  );
}
