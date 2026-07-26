import type { ButtonHTMLAttributes, ReactNode } from "react";
import { dangerButtonClassFor, type UiDensity } from "./buttonClasses";

export type DangerButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  density?: UiDensity;
};

export function DangerButton({
  children,
  className = "",
  type = "button",
  density = "comfortable",
  ...props
}: DangerButtonProps) {
  return (
    <button
      type={type}
      className={`${dangerButtonClassFor(density)}${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
