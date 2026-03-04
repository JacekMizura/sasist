import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type Warehouse = {
  id: number;
  name: string;
};

type WarehouseContextType = {
  warehouse: Warehouse | null;
  setWarehouse: (w: Warehouse) => void;
};

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

export function WarehouseProvider({ children }: { children: ReactNode }) {

  const [warehouse, setWarehouseState] = useState<Warehouse | null>(() => {
    const saved = localStorage.getItem("warehouse");
    return saved ? JSON.parse(saved) : null;
  });

  const setWarehouse = (w: Warehouse) => {
    setWarehouseState(w);
    localStorage.setItem("warehouse", JSON.stringify(w));
  };

  return (
    <WarehouseContext.Provider value={{ warehouse, setWarehouse }}>
      {children}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse() {
  const context = useContext(WarehouseContext);
  if (!context) {
    throw new Error("useWarehouse must be used inside WarehouseProvider");
  }
  return context;
}