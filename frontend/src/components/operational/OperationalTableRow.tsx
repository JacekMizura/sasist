import type { HTMLAttributes, ReactNode } from "react";

import { panelListDenseRowClass, panelListDenseRowSelectedClass } from "./operationalListTokens";

type Props = Omit<HTMLAttributes<HTMLTableRowElement>, "className"> & {
  className?: string;
  selected?: boolean;
  children: ReactNode;
};

export function OperationalTableRow({ selected, className = "", children, ...rest }: Props) {
  return (
    <tr
      className={`${panelListDenseRowClass} ${selected ? panelListDenseRowSelectedClass : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </tr>
  );
}
