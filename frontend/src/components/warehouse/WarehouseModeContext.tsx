import { createContext, useContext, type ReactNode } from "react";

/**
 * Top-level warehouse UI mode.
 * - live = Magazyn (read / occupancy / product rails)
 * - designer = Projektowanie (edit tools; routing stays designer-internal via layoutWorkspace)
 */
export type WarehouseMode = "live" | "designer";

export type WarehouseModeContextValue = {
  mode: WarehouseMode;
  isLive: boolean;
  isDesigner: boolean;
};

const WarehouseModeContext = createContext<WarehouseModeContextValue | null>(null);

export function WarehouseModeProvider({
  mode,
  children,
}: {
  mode: WarehouseMode;
  children: ReactNode;
}) {
  const value: WarehouseModeContextValue = {
    mode,
    isLive: mode === "live",
    isDesigner: mode === "designer",
  };
  return <WarehouseModeContext.Provider value={value}>{children}</WarehouseModeContext.Provider>;
}

export function useWarehouseMode(): WarehouseModeContextValue {
  const ctx = useContext(WarehouseModeContext);
  if (!ctx) {
    throw new Error("useWarehouseMode must be used within WarehouseModeProvider");
  }
  return ctx;
}

/** Safe for Canvas / overlays that may render outside Provider (e.g. product map modal). */
export function useWarehouseModeOptional(): WarehouseModeContextValue | null {
  return useContext(WarehouseModeContext);
}

export function mainViewToWarehouseMode(mainView: "magazyn" | "layout"): WarehouseMode {
  return mainView === "magazyn" ? "live" : "designer";
}
