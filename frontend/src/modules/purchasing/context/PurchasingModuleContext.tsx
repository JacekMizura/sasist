import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../../api/axios";

export type PurchasingTenant = { id: number; name: string };

type PurchasingModuleContextValue = {
  tenantId: number;
  setTenantId: (id: number) => void;
  tenants: PurchasingTenant[];
  refreshSignal: number;
  triggerRefresh: () => void;
};

const PurchasingModuleContext = createContext<PurchasingModuleContextValue | null>(null);

export function PurchasingModuleProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState<PurchasingTenant[]>([]);
  const [tenantId, setTenantIdState] = useState(() => {
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) return n;
    }
    return 1;
  });
  const [refreshSignal, setRefreshSignal] = useState(0);

  useEffect(() => {
    void api
      .get<PurchasingTenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length > 0) {
          setTenantIdState((prev) => (list.some((t) => t.id === prev) ? prev : list[0].id));
        }
      })
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) setTenantIdState(n);
    }
  }, [searchParams]);

  const setTenantId = useCallback(
    (id: number) => {
      setTenantIdState(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tenant_id", String(id));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const triggerRefresh = useCallback(() => {
    setRefreshSignal((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ tenantId, setTenantId, tenants, refreshSignal, triggerRefresh }),
    [tenantId, setTenantId, tenants, refreshSignal, triggerRefresh],
  );

  return <PurchasingModuleContext.Provider value={value}>{children}</PurchasingModuleContext.Provider>;
}

export function usePurchasingModuleContext(): PurchasingModuleContextValue {
  const ctx = useContext(PurchasingModuleContext);
  if (!ctx) {
    throw new Error("usePurchasingModuleContext must be used within PurchasingModuleProvider");
  }
  return ctx;
}

export function usePurchasingModuleContextOptional(): PurchasingModuleContextValue | null {
  return useContext(PurchasingModuleContext);
}
