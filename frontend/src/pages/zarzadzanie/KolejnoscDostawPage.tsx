/**
 * Kolejność dostaw — lista kolejki z istniejącego API planu (bez nowego silnika).
 */
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw } from "lucide-react";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { useSupplyFlowPlan } from "../wms/supply-flow/hooks/useSupplyFlowPlan";
import { markLeavingForWork } from "../wms/supply-flow/utils/shiftBoard";

export default function KolejnoscDostawPage() {
  const { hasActiveWarehouse, warehouseId } = useActiveWarehouseContext();
  const { board, loading, refreshing, error, refresh } = useSupplyFlowPlan(
    hasActiveWarehouse ? warehouseId : null,
  );

  const rows = [
    ...(board.attention
      ? [
          {
            id: board.attention.deliveryId ?? "focus",
            title: board.attention.title,
            meta: board.attention.whyBullets[0] || null,
            ctaLabel: board.attention.ctaLabel,
            ctaHref: board.attention.ctaHref,
            primary: true,
          },
        ]
      : []),
    ...board.queue.map((q) => ({
      id: q.deliveryId,
      title: q.title,
      meta: `${q.phaseLabel} · ${q.urgencyLabel}${q.effectLine ? ` · ${q.effectLine}` : ""}`,
      ctaLabel: q.ctaLabel,
      ctaHref: q.ctaHref,
      primary: false,
    })),
  ];

  return (
    <div className="mx-auto min-w-0 max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Kolejność dostaw</h1>
          <p className="mt-1 text-sm text-slate-500">
            W jakiej kolejności prowadzić pracę przy dostawach na tej zmianie.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || loading || !hasActiveWarehouse}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-40"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Odśwież
        </button>
      </div>

      {!hasActiveWarehouse ? (
        <ActiveWarehouseRequiredBanner hint="Wybierz aktywny magazyn, aby zobaczyć kolejność dostaw." />
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {error}
        </p>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-slate-500">Ładowanie kolejki…</p>
      ) : null}

      {!loading && hasActiveWarehouse && rows.length === 0 ? (
        <p className="text-sm text-slate-600">Brak dostaw w kolejce na tej zmianie.</p>
      ) : null}

      <ol className="space-y-2">
        {rows.map((row, idx) => (
          <li
            key={String(row.id)}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
              row.primary ? "border-orange-300 bg-orange-50/60" : "border-slate-200 bg-white"
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">
                <span className="mr-2 tabular-nums text-slate-400">{idx + 1}.</span>
                {row.title}
              </p>
              {row.meta ? <p className="mt-0.5 text-xs text-slate-500">{row.meta}</p> : null}
            </div>
            <Link
              to={row.ctaHref}
              onClick={() =>
                markLeavingForWork({
                  leftAt: Date.now(),
                  title: row.title,
                  deliveryId: typeof row.id === "number" ? row.id : null,
                })
              }
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              {row.ctaLabel}
              <ArrowRight size={14} />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
