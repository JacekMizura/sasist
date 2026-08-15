import { memo, type ReactNode } from "react";

import { PurchasingKpiGrid } from "../../../modules/purchasing/ui";

type Props = {
  children: ReactNode;
  className?: string;
  /** Desktop columns — Pulpit uses 5; other screens typically 4. */
  columns?: 4 | 5;
};

/**
 * Kanoniczna siatka KPI modułu Produkcja — gęsta, pełna szerokość pulpitu.
 */
function ProductionKpiGridInner({ children, className = "", columns = 4 }: Props) {
  return (
    <PurchasingKpiGrid columns={columns} className={`items-stretch gap-2 ${className}`.trim()}>
      {children}
    </PurchasingKpiGrid>
  );
}

export const ProductionKpiGrid = memo(ProductionKpiGridInner);
