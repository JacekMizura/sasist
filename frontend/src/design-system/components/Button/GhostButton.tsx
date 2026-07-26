import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ghostButtonClassFor, type UiDensity } from "./buttonClasses";

export type GhostButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  density?: UiDensity;
};

export function GhostButton({
  children,
  className = "",
  type = "button",
  density = "default",
  ...props
}: GhostButtonProps) {
  return (
    <button
      type={type}
      className={`${ghostButtonClassFor(density)}${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
