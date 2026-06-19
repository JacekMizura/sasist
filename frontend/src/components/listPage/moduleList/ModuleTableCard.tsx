import type { ReactNode } from "react";

import { moduleTableCardClass } from "./moduleListViewTokens";

type ModuleTableCardProps = {
  bulkBar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function ModuleTableCard({ bulkBar, children, footer }: ModuleTableCardProps) {
  return (
    <div className={moduleTableCardClass}>
      {bulkBar}
      {children}
      {footer}
    </div>
  );
}
