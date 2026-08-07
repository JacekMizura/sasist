import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ERP_SIDEBAR_COLLAPSE_STORAGE_KEY } from "./erpSidebarStyles";

type ErpSidebarUiValue = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (next: boolean) => void;
};

const ErpSidebarUiContext = createContext<ErpSidebarUiValue | null>(null);

function readCollapsedPreference(): boolean {
  try {
    const raw = localStorage.getItem(ERP_SIDEBAR_COLLAPSE_STORAGE_KEY);
    // Default = icon rail (narrow). Only expand when user explicitly saved "0".
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export function ErpSidebarUiProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(readCollapsedPreference);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      localStorage.setItem(ERP_SIDEBAR_COLLAPSE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(ERP_SIDEBAR_COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, setCollapsed }),
    [collapsed, toggleCollapsed, setCollapsed],
  );

  return <ErpSidebarUiContext.Provider value={value}>{children}</ErpSidebarUiContext.Provider>;
}

export function useErpSidebarUi(): ErpSidebarUiValue {
  const ctx = useContext(ErpSidebarUiContext);
  if (!ctx) {
    throw new Error("useErpSidebarUi must be used within ErpSidebarUiProvider");
  }
  return ctx;
}

/** Safe for header / optional consumers outside provider. */
export function useErpSidebarUiOptional(): ErpSidebarUiValue | null {
  return useContext(ErpSidebarUiContext);
}
