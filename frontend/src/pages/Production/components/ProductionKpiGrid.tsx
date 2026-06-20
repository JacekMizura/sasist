import { memo, type ReactNode } from "react";

import { PurchasingKpiGrid } from "../../../modules/purchasing/ui";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Kanoniczna siatka KPI modułu Produkcja — zawsze 4 kolumny na desktopie.
 * Nie używa grid-cols-3 (marnuje przestrzeń przy prostych metrykach).
 */
function ProductionKpiGridInner({ children, className = "" }: Props) {
  return (
    <PurchasingKpiGrid columns={4} className={`gap-3 ${className}`.trim()}>
      {children}
    </PurchasingKpiGrid>
  );
}

export const ProductionKpiGrid = memo(ProductionKpiGridInner);
