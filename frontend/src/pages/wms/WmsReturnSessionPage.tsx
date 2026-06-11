import { useState } from "react";
import { useParams, Navigate } from "react-router-dom";

import type { WmsReturnRead } from "../../types/wmsReturn";
import WmsReturnsPage from "../damage/WmsReturnsPage";
import { WmsReturnDraftPhase } from "./WmsReturnDraftPhase";

/** Przekierowanie ze starej trasy `/returns/create/:orderId`. */
export function WmsReturnCreateLegacyRedirect() {
  const { orderId } = useParams<{ orderId: string }>();
  return <Navigate to={`/wms/returns/order/${orderId ?? ""}`} replace />;
}

export default function WmsReturnSessionPage() {
  const { orderId: orderIdParam } = useParams<{ orderId: string }>();
  const orderId = orderIdParam ? Number(orderIdParam) : NaN;
  const [createdReturn, setCreatedReturn] = useState<WmsReturnRead | null>(null);

  if (!Number.isFinite(orderId) || orderId <= 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-rose-700">Nieprawidłowy identyfikator zamówienia.</div>
    );
  }

  if (createdReturn == null) {
    return <WmsReturnDraftPhase orderId={orderId} onCreated={setCreatedReturn} />;
  }

  return (
    <WmsReturnsPage
      embeddedReturnId={createdReturn.id}
      initialReturn={createdReturn}
      embeddedOrderId={orderId}
    />
  );
}
