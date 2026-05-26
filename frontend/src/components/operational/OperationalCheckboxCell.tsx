import type { TdHTMLAttributes } from "react";

import { operationalCheckboxColumnCellClass } from "./operationalListTokens";

type Props = Omit<TdHTMLAttributes<HTMLTableCellElement>, "className"> & {
  className?: string;
};

/**
 * Sticky selection column — fixed width and alignment match every operational list (`Orders`, `Returns`, …).
 */
export function OperationalCheckboxCell({ className = "", children, ...rest }: Props) {
  return (
    <td className={`${operationalCheckboxColumnCellClass} ${className}`.trim()} {...rest}>
      {children}
    </td>
  );
}
