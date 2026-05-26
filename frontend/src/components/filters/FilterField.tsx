import type { ReactNode } from "react";

import { filterLabelClass } from "./filterUiTokens";

type FilterFieldProps = {
  label: string;
  children: ReactNode;
  /** Tailwind column span classes, e.g. sm:col-span-2 */
  className?: string;
  htmlFor?: string;
  /** Override default filter label typography (e.g. dense list pages). */
  labelClassName?: string;
};

export function FilterField({ label, children, className = "", htmlFor, labelClassName }: FilterFieldProps) {
  return (
    <label className={`flex min-w-0 flex-col gap-0.5 ${className}`.trim()} htmlFor={htmlFor}>
      <span className={labelClassName ?? filterLabelClass}>{label}</span>
      {children}
    </label>
  );
}
