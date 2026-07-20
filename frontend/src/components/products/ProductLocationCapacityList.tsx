import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  batchProductLocationCapacities,
  type ProductLocationCapacity,
} from "../../api/slottingApi";

type LocRef = { location_id: number; location_code?: string; quantity?: number };

type Props = {
  productId: number;
  tenantId: number;
  locations: LocRef[];
};

/**
 * Product × location capacity — backend SSOT only (batch API).
 * Never computes floor(W/w) locally.
 */
export default function ProductLocationCapacityList({ productId, tenantId, locations }: Props) {
  const ids = useMemo(
    () =>
      Array.from(
        new Set(
          locations
            .map((l) => Number(l.location_id))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      ).slice(0, 80),
    [locations],
  );
  const [items, setItems] = useState<ProductLocationCapacity[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!productId || !tenantId || ids.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void batchProductLocationCapacities({
      tenant_id: tenantId,
      product_id: productId,
      location_ids: ids,
    })
      .then((res) => {
        if (!cancelled) setItems(res.items ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setErr("Nie udało się wczytać pojemności lokalizacji.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, tenantId, ids.join(",")]);

  if (ids.length === 0) return null;

  return (
    <section className="mt-4 space-y-3">
      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Pojemność lokalizacji</h4>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Liczenie pojemności…
        </div>
      ) : null}
      {err ? <p className="text-sm text-rose-700">{err}</p> : null}
      <ul className="space-y-2">
        {items.map((c) => {
          const full = c.additional_capacity <= 0 && c.confidence !== "UNKNOWN";
          const estimated = String(c.confidence).toUpperCase() === "ESTIMATED";
          return (
            <li
              key={c.location_id}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-900">{c.location_code || `#${c.location_id}`}</p>
                  <p className="mt-0.5 tabular-nums text-slate-700">
                    {c.capacity_ratio_label} szt.
                  </p>
                  <p className={`mt-1 text-xs font-semibold ${estimated ? "text-amber-800" : "text-emerald-700"}`}>
                    {full ? "PEŁNA" : c.additional_capacity_label}
                  </p>
                </div>
                <div className="text-right text-[10px] font-black uppercase tracking-wide text-slate-400">
                  {estimated ? "Szacunkowe" : String(c.confidence).toUpperCase() === "EXACT" ? "Dokładne" : "—"}
                  {c.limiting_factor_label ? (
                    <p className="mt-1 font-bold text-slate-500">{c.limiting_factor_label}</p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
