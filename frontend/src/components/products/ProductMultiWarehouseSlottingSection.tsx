import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  fetchProductSlottingByWarehouse,
  type ProductWarehouseSlottingAll,
} from "../../api/multiWarehouseUiApi";

type Props = {
  productId: number;
  tenantId: number;
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

export default function ProductMultiWarehouseSlottingSection({ productId, tenantId }: Props) {
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

  return (
    <section className="w-full space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Plan rozmieszczenia</h3>
        <p className="mt-1 text-xs text-slate-500">Podgląd tylko do odczytu — edycja w Warehouse Designer.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Wczytywanie…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {warehouses.map((wh) => (
            <div key={wh.warehouse_id} className={cardClass}>
              <h4 className="mb-2 text-sm font-bold text-slate-900">{wh.warehouse_name}</h4>
              {wh.location_codes.length > 0 ? (
                <ul className="space-y-1 text-sm text-slate-800">
                  {wh.location_codes.map((code) => (
                    <li key={`${wh.warehouse_id}-${code}`} className="font-mono text-xs sm:text-sm">
                      {code}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">brak</p>
              )}
            </div>
          ))}
          {warehouses.length === 0 ? (
            <p className="text-sm text-slate-500">Brak magazynów tenanta.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
