import { memo, type ReactNode } from "react";

import { PurchasingKpiGrid } from "../../../modules/purchasing/ui";

type Props = {
  children: ReactNode;
  className?: string;
};

/** Kanoniczna siatka KPI modułu BDO — 4 kolumny na desktopie. */
function BdoKpiGridInner({ children, className = "" }: Props) {
  return (
    <PurchasingKpiGrid columns={4} className={`gap-3 ${className}`.trim()}>
      {children}
    </PurchasingKpiGrid>
  );
}

export const BdoKpiGrid = memo(BdoKpiGridInner);
