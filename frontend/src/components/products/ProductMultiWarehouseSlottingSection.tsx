import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MapPin, Warehouse } from "lucide-react";

import {
  fetchProductSlottingByWarehouse,
  type ProductWarehouseSlottingAll,
} from "../../api/multiWarehouseUiApi";
import { isSuperRole } from "../../auth/isSuperRole";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";

type Props = {
  productId: number;
  tenantId: number;
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

const WMS_WAREHOUSE_PERMISSIONS = [
  "warehouse.operations",
  "warehouse.relocations",
  "warehouse.stock",
  "warehouse.inventory",
] as const;

function canAccessWmsWarehouseTools(
  hasPermission: (key: string) => boolean,
  role: string | undefined,
): boolean {
  if (isSuperRole(role ?? "")) return true;
  return WMS_WAREHOUSE_PERMISSIONS.some((key) => hasPermission(key));
}

export default function ProductMultiWarehouseSlottingSection({ productId, tenantId }: Props) {
  const { user, hasPermission } = useAuth();
  const { warehouses: operableWarehouses } = useWarehouse();
  const [data, setData] = useState<ProductWarehouseSlottingAll | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchProductSlottingByWarehouse(productId, tenantId)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, tenantId]);

  const warehouses = data?.warehouses ?? [];

  const totalLocations = useMemo(
    () => warehouses.reduce((sum, wh) => sum + wh.location_codes.length, 0),
    [warehouses],
  );

  const allWarehousesEmpty =
    warehouses.length > 0 && warehouses.every((wh) => wh.location_codes.length === 0);

  const showDesignerButton =
    canAccessWmsWarehouseTools(hasPermission, user?.role) &&
    (operableWarehouses.length > 0 || warehouses.length > 0);

  const sectionTitle =
    totalLocations > 0 ? `Lokalizacje produktu (${totalLocations})` : "Lokalizacje produktu";

  return (
    <section className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">{sectionTitle}</h3>
        {showDesignerButton ? (
          <Link
            to="/designer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Warehouse className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            Otwórz Projektant Magazynu
          </Link>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Wczytywanie lokalizacji…
        </div>
      ) : warehouses.length === 0 ? (
        <p className="text-sm text-slate-600">Brak magazynów przypisanych do firmy.</p>
      ) : (
        <>
          {allWarehousesEmpty ? (
            <p className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
              Ten produkt nie został jeszcze przypisany do żadnej lokalizacji magazynowej.
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {warehouses.map((wh) => {
              const count = wh.location_codes.length;
              return (
                <div key={wh.warehouse_id} className={cardClass}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-900">{wh.warehouse_name}</h4>
                    {count > 0 ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                        {count}
                      </span>
                    ) : null}
                  </div>
                  {count > 0 ? (
                    <ul className="space-y-1.5">
                      {wh.location_codes.map((code) => (
                        <li
                          key={`${wh.warehouse_id}-${code}`}
                          className="flex items-center gap-2 font-mono text-xs text-slate-800 sm:text-sm"
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                          {code}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">Brak przypisanych lokalizacji</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
