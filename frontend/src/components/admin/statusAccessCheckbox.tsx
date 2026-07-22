import type { InputHTMLAttributes } from "react";

/**
 * Shared checkbox for role/user order-status access matrices.
 * Same tokens as Edycja użytkownika → WMS / Statusy (orange accent, larger hit target).
 */
export const STATUS_ACCESS_CHECKBOX_CLASS =
  "h-5 w-5 shrink-0 rounded border-slate-300 accent-orange-500 disabled:cursor-not-allowed disabled:opacity-50";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  className?: string;
};

export function StatusAccessCheckbox({ className = "", ...rest }: Props) {
  return (
    <input
      type="checkbox"
      className={`${STATUS_ACCESS_CHECKBOX_CLASS} ${className}`.trim()}
      {...rest}
    />
  );
}
