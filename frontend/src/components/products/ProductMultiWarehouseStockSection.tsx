import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  fetchProductWarehouseStockBreakdown,
  fmtStockQty,
  type ProductWarehouseStockBreakdown,
} from "../../api/multiWarehouseUiApi";

type Props = {
  productId: number;
  tenantId: number;
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

export default function ProductMultiWarehouseStockSection({ productId, tenantId }: Props) {
  const [data, setData] = useState<ProductWarehouseStockBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void fetchProductWarehouseStockBreakdown(productId, tenantId)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setErr("Nie udało się wczytać stanów magazynowych.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, tenantId]);

  if (loading) {
    return (
      <section className="w-full space-y-3">
        <h3 className="text-base font-semibold text-slate-900">Stany magazynowe</h3>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Wczytywanie…
        </div>
      </section>
    );
  }

  if (err) {
    return (
      <section className="w-full space-y-3">
        <h3 className="text-base font-semibold text-slate-900">Stany magazynowe</h3>
        <p className="text-sm text-rose-700">{err}</p>
      </section>
    );
  }

  const warehouses = data?.warehouses ?? [];
  const totals = data?.network_totals;

  return (
    <section className="w-full space-y-4">
      <h3 className="text-base font-semibold text-slate-900">Stany magazynowe</h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {warehouses.map((wh) => (
          <div key={wh.warehouse_id} className={cardClass}>
            <h4 className="mb-3 text-sm font-bold text-slate-900">{wh.warehouse_name}</h4>
            <div className="space-y-2">
              <MetricRow label="Stan fizyczny" value={`${fmtStockQty(wh.physical_quantity)} szt.`} />
              <MetricRow label="Dostępne" value={`${fmtStockQty(wh.available_quantity)} szt.`} />
              <MetricRow label="Zarezerwowane" value={`${fmtStockQty(wh.reserved_quantity)} szt.`} />
            </div>
          </div>
        ))}
        {warehouses.length === 0 ? (
          <p className="text-sm text-slate-500">Brak przypisanych magazynów dla tenanta.</p>
        ) : null}
      </div>

      {totals ? (
        <div className={`${cardClass} w-full`}>
          <h4 className="mb-3 text-sm font-bold text-slate-900">Łącznie (sieć)</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            <MetricRow label="Stan fizyczny" value={`${fmtStockQty(totals.physical_quantity)} szt.`} />
            <MetricRow
              label="Dostępne handlowo"
              value={`${fmtStockQty(totals.commercially_sellable_qty)} szt.`}
            />
            <MetricRow label="Zarezerwowane" value={`${fmtStockQty(totals.reserved_quantity)} szt.`} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
