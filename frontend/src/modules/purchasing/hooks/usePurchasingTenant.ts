import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchTenantsList } from "../../../api/tenantsApi";
import {
  usePurchasingModuleContextOptional,
  type PurchasingTenant,
} from "../context/PurchasingModuleContext";

/**
 * Tenant + refresh z kontekstu modułu (pasek u góry) lub lokalnie poza `/purchasing/*`.
 */
export function usePurchasingTenant() {
  const moduleCtx = usePurchasingModuleContextOptional();
  const [searchParams] = useSearchParams();
  const [localTenants, setLocalTenants] = useState<PurchasingTenant[]>([]);
  const [localTenantId, setLocalTenantId] = useState(() => {
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) return n;
    }
    return 1;
  });

  useEffect(() => {
    if (moduleCtx) return;
    void fetchTenantsList()
      .then((list) => {
        setLocalTenants(list);
        if (list.length > 0) {
          setLocalTenantId((prev) => (list.some((t) => t.id === prev) ? prev : list[0].id));
        }
      })
      .catch(() => setLocalTenants([]));
  }, [moduleCtx]);

  useEffect(() => {
    if (moduleCtx) return;
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) setLocalTenantId(n);
    }
  }, [moduleCtx, searchParams]);

  const setTenantId = useCallback(
    (id: number) => {
      if (moduleCtx) {
        moduleCtx.setTenantId(id);
        return;
      }
      setLocalTenantId(id);
    },
    [moduleCtx],
  );

  return {
    tenantId: moduleCtx?.tenantId ?? localTenantId,
    setTenantId,
    tenants: moduleCtx?.tenants ?? localTenants,
    refreshSignal: moduleCtx?.refreshSignal ?? 0,
  };
}
