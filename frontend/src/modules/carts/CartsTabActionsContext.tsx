import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type CartsTabActionsContextValue = {
  setTabActions: (node: ReactNode | null) => void;
  tabActions: ReactNode | null;
};

const CartsTabActionsContext = createContext<CartsTabActionsContextValue | null>(null);

export function CartsTabActionsProvider({ children }: { children: ReactNode }) {
  const [tabActions, setTabActionsState] = useState<ReactNode | null>(null);
  const setTabActions = useCallback((node: ReactNode | null) => {
    setTabActionsState(node);
  }, []);
  const value = useMemo(() => ({ setTabActions, tabActions }), [setTabActions, tabActions]);
  return <CartsTabActionsContext.Provider value={value}>{children}</CartsTabActionsContext.Provider>;
}

/** Register trailing tab-bar actions for the active Magazyn tab (clears on unmount). */
export function useCartsTabActions(actions: ReactNode | null) {
  const ctx = useContext(CartsTabActionsContext);
  useLayoutEffect(() => {
    if (!ctx) return;
    ctx.setTabActions(actions);
    return () => ctx.setTabActions(null);
  }, [ctx, actions]);
}

export function useCartsTabActionsSlot(): ReactNode | null {
  return useContext(CartsTabActionsContext)?.tabActions ?? null;
}
