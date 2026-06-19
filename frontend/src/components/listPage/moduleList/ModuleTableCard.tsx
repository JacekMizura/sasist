import type { ReactNode } from "react";

import { flatListTableSectionClass } from "../../layout/flatSectionTokens";
import { moduleTableCardClass } from "./moduleListViewTokens";

type ModuleTableCardProps = {
  bulkBar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function ModuleTableCard({ bulkBar, children, footer }: ModuleTableCardProps) {
  return (
    <div className={`${moduleTableCardClass} ${flatListTableSectionClass}`}>
      {bulkBar}
      {children}
      {footer}
    </div>
  );
}
