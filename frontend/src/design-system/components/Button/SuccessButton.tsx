import type { ButtonHTMLAttributes, ReactNode } from "react";
import { successButtonClassFor, type UiDensity } from "./buttonClasses";

export type SuccessButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  density?: UiDensity;
};

export function SuccessButton({
  children,
  className = "",
  type = "button",
  density = "comfortable",
  ...props
}: SuccessButtonProps) {
  return (
    <button
      type={type}
      className={`${successButtonClassFor(density)}${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
