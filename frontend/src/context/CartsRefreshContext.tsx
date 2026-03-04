import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/** Refresh Bus: when simulation (Oblicz / single-cart assign) or Resetuj Flotę finishes, call refreshCarts() so the Carts tab refetches. */
type CartsRefreshContextType = {
  cartsRefreshTrigger: number;
  refreshCarts: () => void;
};

const CartsRefreshContext = createContext<CartsRefreshContextType | undefined>(undefined);

export function CartsRefreshProvider({ children }: { children: ReactNode }) {
  const [cartsRefreshTrigger, setCartsRefreshTrigger] = useState(0);
  const refreshCarts = useCallback(() => {
    setCartsRefreshTrigger((t) => t + 1);
  }, []);
  return (
    <CartsRefreshContext.Provider value={{ cartsRefreshTrigger, refreshCarts }}>
      {children}
    </CartsRefreshContext.Provider>
  );
}

export function useCartsRefresh() {
  const context = useContext(CartsRefreshContext);
  return context;
}
