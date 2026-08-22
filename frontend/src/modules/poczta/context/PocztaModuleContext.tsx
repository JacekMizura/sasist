import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchTenantsList } from "../../../api/tenantsApi";

export type PocztaTenant = { id: number; name: string };

type Ctx = {
  tenantId: number;
  setTenantId: (id: number) => void;
  tenants: PocztaTenant[];
  refreshSignal: number;
  triggerRefresh: () => void;
};

const PocztaModuleContext = createContext<Ctx | null>(null);

export function PocztaModuleProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const [tenants, setTenants] = useState<PocztaTenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [refreshSignal, setRefreshSignal] = useState(0);

  useEffect(() => {
    void fetchTenantsList()
      .then((list) => {
        setTenants(list);
        if (list.length > 0) {
          setTenantId((prev) => (list.some((t) => t.id === prev) ? prev : list[0].id));
        }
      })
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) setTenantId(n);
    }
  }, [searchParams]);

  const triggerRefresh = useCallback(() => setRefreshSignal((s) => s + 1), []);

  const value = useMemo(
    () => ({ tenantId, setTenantId, tenants, refreshSignal, triggerRefresh }),
    [tenantId, tenants, refreshSignal, triggerRefresh],
  );

  return <PocztaModuleContext.Provider value={value}>{children}</PocztaModuleContext.Provider>;
}

export function usePocztaModuleContext(): Ctx {
  const ctx = useContext(PocztaModuleContext);
  if (!ctx) throw new Error("usePocztaModuleContext outside provider");
  return ctx;
}

export function usePocztaModuleContextOptional(): Ctx | null {
  return useContext(PocztaModuleContext);
}
