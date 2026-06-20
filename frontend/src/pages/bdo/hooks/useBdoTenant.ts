import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import api from "../../../api/axios";

export type BdoTenant = { id: number; name: string };

export function useBdoTenant() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState<BdoTenant[]>([]);
  const [tenantId, setTenantIdState] = useState(1);

  useEffect(() => {
    api
      .get<BdoTenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        const tid = searchParams.get("tenant_id");
        if (tid != null && tid !== "") {
          const n = Number(tid);
          if (Number.isFinite(n) && n >= 1) setTenantIdState(n);
        }
      })
      .catch(() => setTenants([]));
  }, [searchParams]);

  const setTenantId = (v: number) => {
    setTenantIdState(v);
    setSearchParams({ tenant_id: String(v) }, { replace: true });
  };

  return { tenants, tenantId, setTenantId };
}
