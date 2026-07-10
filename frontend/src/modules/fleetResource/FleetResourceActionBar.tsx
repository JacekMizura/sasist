import type { ButtonHTMLAttributes, ReactNode } from "react";

import {
  fleetResourceActionBarClass,
  fleetResourceActionBtnClass,
  fleetResourceActionBtnDangerClass,
  fleetResourceActionBtnWarnClass,
} from "./fleetResourceTokens";

export type FleetResourceActionBarProps = {
  children: ReactNode;
  "aria-label"?: string;
};

export function FleetResourceActionBar({ children, "aria-label": ariaLabel = "Akcje" }: FleetResourceActionBarProps) {
  return (
    <div className={fleetResourceActionBarClass} role="group" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

type FleetActionBtnProps = {
  variant?: "default" | "danger" | "warn";
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function FleetResourceActionButton({
  variant = "default",
  className = "",
  children,
  type = "button",
  ...rest
}: FleetActionBtnProps) {
  const base =
    variant === "danger"
      ? fleetResourceActionBtnDangerClass
      : variant === "warn"
        ? fleetResourceActionBtnWarnClass
        : fleetResourceActionBtnClass;
  return (
    <button type={type} className={`${base} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
