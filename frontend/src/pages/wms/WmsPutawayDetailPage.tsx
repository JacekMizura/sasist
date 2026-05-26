import { Navigate, useLocation, useParams } from "react-router-dom";
import { WMS_ROUTES } from "./wmsRoutes";

const TENANT_STORAGE_KEY = "wms.receiving.tenantId";

/** Legacy URL → krok 2 (wybór lokalizacji). */
export default function WmsPutawayDetailPage() {
  const { pzId: pzIdParam, itemId: itemIdParam } = useParams();
  const location = useLocation();
  const pzId = Number(pzIdParam);
  const itemId = Number(itemIdParam);
  const tenantFromState = (location.state as { tenantId?: number } | null)?.tenantId;
  const tenantId =
    tenantFromState && tenantFromState >= 1
      ? tenantFromState
      : (() => {
          const raw = localStorage.getItem(TENANT_STORAGE_KEY);
          const n = raw != null ? Number(raw) : NaN;
          return Number.isFinite(n) && n >= 1 ? n : 1;
        })();

  if (!Number.isFinite(pzId) || pzId < 1) {
    return <Navigate to={WMS_ROUTES.putaway} replace />;
  }
  if (!Number.isFinite(itemId) || itemId < 1) {
    return <Navigate to={WMS_ROUTES.putawayPz(pzId)} replace state={{ tenantId }} />;
  }
  return <Navigate to={WMS_ROUTES.putawayItem(pzId, itemId)} replace state={{ tenantId }} />;
}
