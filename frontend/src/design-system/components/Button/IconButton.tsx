import type { ButtonHTMLAttributes, ReactNode } from "react";
import { iconButtonClassFor, iconButtonDangerClassFor, type UiDensity } from "./buttonClasses";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  density?: UiDensity;
  tone?: "neutral" | "danger";
};

export function IconButton({
  children,
  className = "",
  type = "button",
  density = "default",
  tone = "neutral",
  ...props
}: IconButtonProps) {
  const base =
    tone === "danger" ? iconButtonDangerClassFor(density) : iconButtonClassFor(density);
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
