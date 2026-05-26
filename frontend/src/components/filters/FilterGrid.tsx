import type { ReactNode } from "react";

import { filterGridColsClass } from "./filterUiTokens";

type FilterGridProps = {
  children: ReactNode;
  /** Default: 1 / 2 / 3 / 4 columns (see `filterGridColsClass`). */
  columnsClassName?: string;
  className?: string;
};

export function FilterGrid({
  children,
  columnsClassName = filterGridColsClass,
  className = "",
}: FilterGridProps) {
  return <div className={`${columnsClassName} ${className}`.trim()}>{children}</div>;
}
