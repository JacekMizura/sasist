import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../../api/axios";

type Tenant = { id: number; name: string };

export type WarehouseCarriersSurface = "erp";

export function useWarehouseCarriersSurface(): WarehouseCarriersSurface {
  return "erp";
}

/** Lista nośników / szczegół — ścieżki w module Magazyn (``/carts/carriers``). */
export function useWarehouseCarriersPaths(_surface: WarehouseCarriersSurface) {
  return useMemo(() => {
    const base = "/carts/carriers";
    return {
      base,
      list: base,
      detail: (id: number) => `${base}/${id}`,
    };
  }, []);
}

export function useWarehouseCarriersTenant(surface: WarehouseCarriersSurface) {
  const routeState = useLocation().state as { tenantId?: number } | null;
  const [tenantId, setTenantId] = useState(() => {
    if (routeState?.tenantId && routeState.tenantId >= 1) return routeState.tenantId;
    return 1;
  });
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    if (surface !== "erp") return;
    api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length > 0 && !list.some((t) => t.id === tenantId)) setTenantId(list[0].id);
      })
      .catch(() => setTenants([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init ERP tenant once
  }, [surface]);

  const onRouteTenant = useCallback(() => {
    if (routeState?.tenantId && routeState.tenantId >= 1) {
      setTenantId(routeState.tenantId);
    }
  }, [routeState?.tenantId]);

  useEffect(() => {
    onRouteTenant();
  }, [onRouteTenant]);

  return { tenantId, setTenantId, tenants, tenantSelectVisible: surface === "erp" && tenants.length > 1 };
}
