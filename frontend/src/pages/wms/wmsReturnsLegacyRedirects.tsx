import { Navigate, useParams } from "react-router-dom";

import { WMS_ROUTES } from "./wmsRoutes";

/** Stare trasy tworzenia RMZ → ekran startowy zwrotów z podświetleniem zamówienia. */
export function WmsReturnsOrderLegacyRedirect() {
  const { orderId } = useParams<{ orderId: string }>();
  const id = orderId ? Number(orderId) : NaN;
  return (
    <Navigate
      to={WMS_ROUTES.returns}
      replace
      state={Number.isFinite(id) && id > 0 ? { preselectOrderId: Math.floor(id) } : undefined}
    />
  );
}
