import { Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";

import { getProductDetailsPath, productDetailsNavState } from "./productPaths";

/**
 * Legacy ``/products/:id`` slim card → redirect to canonical Assortment product page.
 */
export default function ProductDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const tenantRaw = Number(searchParams.get("tenant_id"));
  const tenantId = Number.isFinite(tenantRaw) && tenantRaw >= 1 ? tenantRaw : undefined;
  const prev = (location.state as { tenantId?: number; returnTo?: string; warehouseId?: number } | null) ?? null;

  const to = getProductDetailsPath(id, {
    tenantId: tenantId ?? prev?.tenantId,
    tab: searchParams.get("tab"),
  });

  return (
    <Navigate
      to={to}
      replace
      state={productDetailsNavState({
        tenantId: tenantId ?? prev?.tenantId,
        warehouseId: prev?.warehouseId,
        returnTo: prev?.returnTo,
      })}
    />
  );
}
