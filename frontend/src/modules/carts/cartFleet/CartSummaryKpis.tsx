import type { ReactNode } from "react";
import { Boxes, Layers, Package, ShoppingCart } from "lucide-react";

import type { CapacitySnapshot } from "../../../types/cartCapacity";
import type { CartStats } from "../../../pages/CartsComponents/cartStats";

export type CartPickProgress = {
  pickedProducts: number;
  totalProducts: number;
};

type CartSummaryKpisProps = {
  stats: CartStats;
  capacity?: CapacitySnapshot | null;
  isSectional?: boolean;
  pickProgress?: CartPickProgress | null;
};

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="flex min-w-[9rem] flex-1 flex-col gap-2 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <div className="text-lg font-bold tabular-nums leading-tight text-slate-900">{value}</div>
      {sub ? <div className="text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent));
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;
  return (
    <div className="relative mx-auto h-16 w-16">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 72 72" aria-hidden>
        <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-slate-900">
        {Math.round(p)}%
      </span>
    </div>
  );
}

/**
 * Top KPI strip for cart details — occupancy from WMS stats + Capacity snapshot.
 */
export function CartSummaryKpis({
  stats,
  capacity,
  isSectional,
  pickProgress,
}: CartSummaryKpisProps) {
  const capOrders =
    capacity?.capacity_orders != null && capacity.capacity_orders > 0
      ? capacity.capacity_orders
      : null;
  const assignedOrders = capacity?.assigned_orders ?? stats.total_orders;
  const capVol =
    capacity?.capacity_volume != null && capacity.capacity_volume > 0
      ? capacity.capacity_volume
      : null;
  const usedVol = capacity?.assigned_volume ?? stats.used_volume_dm3;
  const sectionsTotal = stats.sections_count || 0;
  const sectionsUsed = stats.baskets_used || 0;

  const picked = Math.max(0, Number(pickProgress?.pickedProducts ?? 0));
  const pickTotal = Math.max(picked, Number(pickProgress?.totalProducts ?? stats.total_products) || 0);
  const pickPct = pickTotal > 0 ? (picked / pickTotal) * 100 : 0;

  return (
    <section aria-label="Podsumowanie">
      {isSectional ? <h3 className="mb-3 text-sm font-semibold text-slate-800">Podsumowanie</h3> : null}
      <div className={`flex flex-wrap gap-3 ${isSectional ? "" : ""}`}>
        <KpiCard
          icon={<ShoppingCart className="h-4 w-4" aria-hidden />}
          label="Zamówienia"
          value={
            capOrders != null ? (
              <>
                {assignedOrders}{" "}
                <span className="text-base font-semibold text-slate-400">z {capOrders}</span>
              </>
            ) : (
              assignedOrders
            )
          }
        />
        <KpiCard
          icon={<Package className="h-4 w-4" aria-hidden />}
          label="Produkty"
          value={stats.total_products}
        />
        <KpiCard
          icon={<Boxes className="h-4 w-4" aria-hidden />}
          label="Objętość"
          value={
            capVol != null ? (
              <>
                {usedVol.toFixed(1)}{" "}
                <span className="text-base font-semibold text-slate-400">
                  z {capVol.toFixed(1)} dm³
                </span>
              </>
            ) : (
              <>{usedVol.toFixed(1)} dm³</>
            )
          }
        />
        <div className="flex min-w-[9rem] flex-1 flex-col gap-1 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Postęp kompletacji
          </span>
          <ProgressRing percent={pickPct} />
          <div className="text-center text-[11px] tabular-nums text-slate-500">
            {picked} / {pickTotal || "—"}
          </div>
        </div>
        {isSectional ? (
          <KpiCard
            icon={<Layers className="h-4 w-4" aria-hidden />}
            label="Zajęte sekcje"
            value={
              <>
                {sectionsUsed}{" "}
                <span className="text-base font-semibold text-slate-400">
                  / {sectionsTotal || "—"}
                </span>
              </>
            }
          />
        ) : null}
      </div>
    </section>
  );
}
