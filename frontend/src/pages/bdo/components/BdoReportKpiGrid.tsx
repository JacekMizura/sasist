import { memo, type ReactNode } from "react";

import { PurchasingKpiGrid } from "../../../modules/purchasing/ui";

type Props = {
  children: ReactNode;
  className?: string;
};

/** KPI raportu miesięcznego — 5 kart w jednym rzędzie na desktopie. */
function BdoReportKpiGridInner({ children, className = "" }: Props) {
  return (
    <PurchasingKpiGrid columns={5} className={`gap-3 ${className}`.trim()}>
      {children}
    </PurchasingKpiGrid>
  );
}

export const BdoReportKpiGrid = memo(BdoReportKpiGridInner);
