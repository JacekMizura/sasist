import type { ReactNode } from "react";

import { useWarehouse } from "../context/WarehouseContext";
import { hasOperableWarehouses } from "../context/warehouseContextLogic";

export const WMS_NO_WAREHOUSE_MESSAGE =
  "Brak przypisanego magazynu. Skontaktuj się z administratorem.";

type Props = {
  children: ReactNode;
};

/** Blocks WMS `<Outlet />` when the user has no operable warehouse assignments. */
export default function WmsWarehouseAccessGate({ children }: Props) {
  const { warehouses, warehousesLoading } = useWarehouse();

  if (warehousesLoading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center p-8 text-sm text-slate-500">
        Ładowanie kontekstu magazynu…
      </div>
    );
  }

  if (!hasOperableWarehouses(warehouses)) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center p-8">
        <div
          className="max-w-md rounded-lg border border-red-200 bg-red-50 px-6 py-4 text-center text-sm text-red-900"
          role="alert"
        >
          <p className="font-semibold">{WMS_NO_WAREHOUSE_MESSAGE}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
