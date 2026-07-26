import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  primaryButtonClassFor,
  warningButtonClassFor,
  type UiDensity,
} from "./buttonClasses";

export type PrimaryButtonIntent = "brand" | "warning";

export type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  density?: UiDensity;
  /** `warning` = amber CTA (blocked save, confirm-anyway). Default brand orange. */
  intent?: PrimaryButtonIntent;
};

/**
 * Official Primary CTA — orange (or amber when intent=warning).
 * Prefer for Zapisz / Dodaj / Nowy …
 * `className` may only add layout wrappers (mt-*, w-full, shrink-0).
 */
export function PrimaryButton({
  children,
  className = "",
  type = "button",
  density = "comfortable",
  intent = "brand",
  ...props
}: PrimaryButtonProps) {
  const base =
    intent === "warning" ? warningButtonClassFor(density) : primaryButtonClassFor(density);
  return (
    <button
      type={type}
      className={`${base}${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function primaryButtonClassName(
  layoutClassName = "",
  density: UiDensity = "comfortable",
  intent: PrimaryButtonIntent = "brand",
): string {
  const base =
    intent === "warning" ? warningButtonClassFor(density) : primaryButtonClassFor(density);
  return `${base}${layoutClassName ? ` ${layoutClassName}` : ""}`.trim();
}
