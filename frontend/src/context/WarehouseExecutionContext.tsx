import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import {
  isOperationalExecutionHub,
  isWarehouseExecutionRoute,
} from "../components/wms/execution/executionRoutes";

const STORAGE_KEY = "wms.warehouseExecutionMode";

export type ScanFeedbackKind = "success" | "error" | "conflict" | "warning";

export type ExecutionActiveContext = {
  /** Primary operation label, e.g. DOGRYWKA BRAKÓW, ROZLOKOWANIE PRODUKTÓW */
  operationType?: string;
  orderNumber?: string | null;
  cartLabel?: string | null;
  sourceLocation?: string | null;
  targetLocation?: string | null;
  remainingQty?: number;
  currentStep?: string | null;
  operatorName?: string | null;
  scanHint?: string;
  /** @deprecated Use operationType */
  taskLabel?: string;
  productName?: string;
  productSku?: string;
  /** @deprecated Use targetLocation */
  carrierLabel?: string;
  /** @deprecated Use sourceLocation */
  locationLabel?: string;
  /** @deprecated Use currentStep */
  stepLabel?: string;
};

export type WarehouseExecutionContextValue = {
  warehouseMode: boolean;
  setWarehouseMode: (enabled: boolean) => void;
  toggleWarehouseMode: () => void;
  activeContext: ExecutionActiveContext | null;
  setActiveContext: (ctx: ExecutionActiveContext | null) => void;
  scanFeedback: ScanFeedbackKind | null;
  pulseScanFeedback: (kind: ScanFeedbackKind) => void;
  isExecutionRoute: boolean;
  isCoarsePointer: boolean;
};

const WarehouseExecutionContext = createContext<WarehouseExecutionContextValue | null>(null);

function loadWarehouseModePreference(): boolean | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* ignore */
  }
  return null;
}

export function WarehouseExecutionProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isExecutionRoute = useMemo(() => isWarehouseExecutionRoute(pathname), [pathname]);
  const pref = useMemo(() => loadWarehouseModePreference(), []);

  const [warehouseMode, setWarehouseModeState] = useState(() => pref ?? true);
  const [activeContext, setActiveContext] = useState<ExecutionActiveContext | null>(null);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedbackKind | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
  });

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const onResize = () => {
      setIsCoarsePointer(mq.matches || window.innerWidth < 900);
    };
    mq.addEventListener("change", onResize);
    window.addEventListener("resize", onResize);
    return () => {
      mq.removeEventListener("change", onResize);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (pref === null && (isExecutionRoute || isOperationalExecutionHub(pathname))) {
      setWarehouseModeState(true);
    }
  }, [isExecutionRoute, pathname, pref]);

  useEffect(() => {
    if (!scanFeedback) return;
    const t = window.setTimeout(() => setScanFeedback(null), 420);
    return () => window.clearTimeout(t);
  }, [scanFeedback]);

  const setWarehouseMode = useCallback((enabled: boolean) => {
    setWarehouseModeState(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleWarehouseMode = useCallback(() => {
    setWarehouseModeState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const pulseScanFeedback = useCallback((kind: ScanFeedbackKind) => {
    setScanFeedback(kind);
  }, []);

  const value = useMemo<WarehouseExecutionContextValue>(
    () => ({
      warehouseMode,
      setWarehouseMode,
      toggleWarehouseMode,
      activeContext,
      setActiveContext,
      scanFeedback,
      pulseScanFeedback,
      isExecutionRoute,
      isCoarsePointer,
    }),
    [
      warehouseMode,
      setWarehouseMode,
      toggleWarehouseMode,
      activeContext,
      scanFeedback,
      pulseScanFeedback,
      isExecutionRoute,
      isCoarsePointer,
    ],
  );

  return (
    <WarehouseExecutionContext.Provider value={value}>{children}</WarehouseExecutionContext.Provider>
  );
}

export function useWarehouseExecution(): WarehouseExecutionContextValue {
  const ctx = useContext(WarehouseExecutionContext);
  if (!ctx) {
    throw new Error("useWarehouseExecution must be used within WarehouseExecutionProvider");
  }
  return ctx;
}

export function useWarehouseExecutionOptional(): WarehouseExecutionContextValue | null {
  return useContext(WarehouseExecutionContext);
}
