import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { createWmsReturn } from "../../api/wmsReturnsApi";
import { displayWarehouseDocumentNumber } from "../../utils/warehouseDocumentNumberDisplay";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WMS_ROUTES } from "./wmsRoutes";

/**
 * Stare trasy `/returns/order/:orderId` i `/returns/create/:orderId`:
 * tworzą pusty RMZ i przechodzą od razu na ekran obsługi (bez widoku tworzenia).
 */
export function WmsReturnsOrderLegacyRedirect() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const id = orderId ? Number(orderId) : NaN;
  const startedRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (!Number.isFinite(id) || id <= 0) {
      setFailed(true);
      return;
    }
    startedRef.current = true;
    void (async () => {
      try {
        const created = await createWmsReturn({
          tenant_id: DAMAGE_TENANT_ID,
          order_id: Math.floor(id),
          return_type: "RMA",
          lines: [],
        });
        const label =
          displayWarehouseDocumentNumber(created.rmz_number) || created.rmz_number || `RMZ #${created.id}`;
        toast.success(`Utworzono zwrot ${label}`);
        navigate(WMS_ROUTES.returnsProcess(created.id), { replace: true });
      } catch (err: unknown) {
        let msg = "Nie udało się utworzyć zwrotu.";
        if (typeof err === "object" && err !== null && "response" in err) {
          const d = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
          if (typeof d === "string" && d.trim()) msg = d.trim();
        }
        toast.error(msg);
        setFailed(true);
      }
    })();
  }, [id, navigate]);

  if (!Number.isFinite(id) || id <= 0 || failed) {
    return (
      <Navigate
        to={WMS_ROUTES.returns}
        replace
        state={Number.isFinite(id) && id > 0 ? { preselectOrderId: Math.floor(id) } : undefined}
      />
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-slate-600">
      Tworzenie zwrotu…
    </div>
  );
}
