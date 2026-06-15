import { Link } from "react-router-dom";
import { Warehouse } from "lucide-react";

import { useWarehouse } from "../../context/WarehouseContext";
import { WMS_ROUTES } from "../../pages/wms/wmsRoutes";

/** Blocks putaway UI when active warehouse has requires_putaway=false (simple stock profile). */
export function WmsPutawayProfileGate({ children }: { children: React.ReactNode }) {
  const { activeWarehouseRequiresPutaway, warehouse } = useWarehouse();

  if (activeWarehouseRequiresPutaway) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Warehouse size={28} />
      </div>
      <h1 className="text-lg font-bold text-slate-900">Rozlokowanie niedostępne</h1>
      <p className="mt-2 text-sm text-slate-600">
        Magazyn <strong>{warehouse?.name ?? "—"}</strong> działa w trybie prostym — towar trafia od razu do{" "}
        <strong>STOCK</strong> bez modułu putaway.
      </p>
      <Link
        to={WMS_ROUTES.receiving}
        className="mt-6 inline-flex rounded-xl bg-[#5a4fcf] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4a3fbf]"
      >
        Przejdź do przyjęć
      </Link>
    </div>
  );
}

export function WmsDockPutawayBanner() {
  const { activeWarehouseRequiresPutaway } = useWarehouse();

  if (!activeWarehouseRequiresPutaway) {
    return null;
  }

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="status"
    >
      <Warehouse className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
      <div>
        <p className="font-bold tracking-tight">DOCK-IN · PUTAWAY REQUIRED</p>
        <p className="mt-0.5 text-amber-900/90">
          Przyjęty towar trafia na rampę DOCK-IN. Dopiero po rozlokowaniu będzie dostępny do sprzedaży i pickingu.
        </p>
      </div>
    </div>
  );
}
