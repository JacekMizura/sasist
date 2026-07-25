import type { ButtonHTMLAttributes, ReactNode } from "react";

import { brandPrimaryButtonClass } from "./brandUi";

export type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

/**
 * Official Primary CTA — identical to Ustawienia → Użytkownicy → „Dodaj użytkownika”.
 *
 * Visual tokens are locked in {@link brandPrimaryButtonClass}.
 * `className` may only add layout wrappers (e.g. `mt-4`, `shrink-0`, `w-full`) — never colors/size/radius.
 */
export function PrimaryButton({
  children,
  className = "",
  type = "button",
  ...props
}: PrimaryButtonProps) {
  return (
    <button type={type} className={`${brandPrimaryButtonClass}${className ? ` ${className}` : ""}`.trim()} {...props}>
      {children}
    </button>
  );
}

/** Same visual as {@link PrimaryButton} for `<Link>` / `<a>` / `<label>`. */
export function primaryButtonClassName(layoutClassName = ""): string {
  return `${brandPrimaryButtonClass}${layoutClassName ? ` ${layoutClassName}` : ""}`.trim();
}
