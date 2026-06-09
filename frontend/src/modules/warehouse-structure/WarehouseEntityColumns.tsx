import type { ReactNode } from "react";

import { productLikeMainAsideClass, productLikeSideColClass, productLikeThreeColClass } from "../../components/catalog/productLikeTokens";

type WarehouseEntityColumnsProps = {
  main: ReactNode;
  side: ReactNode;
};

/** Układ 2-kolumnowy jak karta produktu (główna + boczna kolumna). */
export function WarehouseEntityColumns({ main, side }: WarehouseEntityColumnsProps) {
  return (
    <div className={productLikeThreeColClass}>
      <div className={productLikeMainAsideClass}>{main}</div>
      <div className={productLikeSideColClass}>{side}</div>
    </div>
  );
}
