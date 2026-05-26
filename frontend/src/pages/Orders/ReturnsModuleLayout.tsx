import { Outlet } from "react-router-dom";

import { useWarehouse } from "../../context/WarehouseContext";

export type ReturnsModuleOutletContext = {
  warehouseId: number | null;
};

/**
 * Tylko kontekst magazynu dla outletu — ten sam „biały panel” co Zamówienia → Lista daje {@link OrdersLayout} (`PageLayout`).
 * Bez dodatkowej karty ani podwójnego paddingu.
 */
export default function ReturnsModuleLayout() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  return <Outlet context={{ warehouseId } satisfies ReturnsModuleOutletContext} />;
}
