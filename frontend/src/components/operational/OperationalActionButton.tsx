import type { ButtonHTMLAttributes, ReactNode } from "react";

import {
  operationalActionButtonAccentClass,
  operationalActionButtonClass,
  operationalActionButtonDangerClass,
} from "./operationalActionButtonTokens";

export type OperationalActionButtonProps = {
  variant?: "default" | "danger" | "accent";
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

/**
 * List row action control — 44×44, `rounded-xl`, 18px icon target. Use for every icon action in operational tables.
 */
export function OperationalActionButton({ variant = "default", className = "", children, type = "button", ...rest }: OperationalActionButtonProps) {
  const base =
    variant === "danger" ? operationalActionButtonDangerClass : variant === "accent" ? operationalActionButtonAccentClass : operationalActionButtonClass;
  return (
    <button type={type} className={`${base} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
