import { useEffect, useState } from "react";
import { Loader2, Warehouse } from "lucide-react";

import {
  fetchTenantWarehouseNetworkSummary,
  fmtStockQty,
  type TenantWarehouseNetworkSummary,
} from "../../api/multiWarehouseUiApi";
import { dashboardSurfaceCard } from "../../components/dashboard/dashboardDensityPrimitives";

type Props = {
  tenantId: number;
};

export default function DashboardWarehouseNetworkSection({ tenantId }: Props) {
  const [data, setData] = useState<TenantWarehouseNetworkSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchTenantWarehouseNetworkSummary(tenantId)
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
  }, [tenantId]);

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="mb-3 flex items-center gap-2">
        <Warehouse className="h-5 w-5 text-slate-500" aria-hidden />
        <h2 className="text-base font-bold text-slate-900">Sieć magazynów</h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Wczytywanie stanów sieciowych…
        </div>
      ) : !data || data.warehouses.length === 0 ? (
        <p className="text-sm text-slate-500">Brak magazynów przypisanych do firmy.</p>
      ) : (
        <div className={`overflow-x-auto ${dashboardSurfaceCard}`}>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Magazyn</th>
                <th className="px-3 py-2 font-semibold text-right">Stan fizyczny</th>
                <th className="px-3 py-2 font-semibold text-right">Dostępne handlowo</th>
                <th className="px-3 py-2 font-semibold text-right">Rezerwacje</th>
              </tr>
            </thead>
            <tbody>
              {data.warehouses.map((row) => (
                <tr key={row.warehouse_id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-900">{row.warehouse_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                    {fmtStockQty(row.physical_quantity)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                    {fmtStockQty(row.commercially_sellable_qty)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                    {fmtStockQty(row.reserved_quantity)}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50/60 font-semibold">
                <td className="px-3 py-2 text-slate-900">Razem</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                  {fmtStockQty(data.totals.physical_quantity)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                  {fmtStockQty(data.totals.commercially_sellable_qty)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                  {fmtStockQty(data.totals.reserved_quantity)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
