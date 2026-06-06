import { createContext, useContext, type ReactNode } from "react";

import {
  DEFAULT_DIRECT_SALES_SETTINGS,
  type DirectSalesSettingsConfig,
} from "../../wmsSettings/directSales/schemas/directSalesSettingsSchema";

/** Resolved direct-sales business config — single source of truth for the operator terminal. */
export type ResolvedDirectSalesSettings = DirectSalesSettingsConfig;

const ResolvedDirectSalesSettingsContext = createContext<ResolvedDirectSalesSettings | null>(null);

type ProviderProps = {
  value: ResolvedDirectSalesSettings;
  children: ReactNode;
};

export function ResolvedDirectSalesSettingsProvider({ value, children }: ProviderProps) {
  return (
    <ResolvedDirectSalesSettingsContext.Provider value={value}>
      {children}
    </ResolvedDirectSalesSettingsContext.Provider>
  );
}

/** Read resolved terminal settings — must be used inside ``ResolvedDirectSalesSettingsProvider``. */
export function useResolvedDirectSalesSettings(): ResolvedDirectSalesSettings {
  const ctx = useContext(ResolvedDirectSalesSettingsContext);
  if (ctx == null) {
    throw new Error("useResolvedDirectSalesSettings requires ResolvedDirectSalesSettingsProvider");
  }
  return ctx;
}

/** Safe accessor for tests/storybook — falls back to schema defaults when provider is absent. */
export function useResolvedDirectSalesSettingsOrDefault(): ResolvedDirectSalesSettings {
  const ctx = useContext(ResolvedDirectSalesSettingsContext);
  return ctx ?? DEFAULT_DIRECT_SALES_SETTINGS;
}
