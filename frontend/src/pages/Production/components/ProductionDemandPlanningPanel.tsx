import { Factory, Package, RefreshCw, ShoppingCart, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

import type { DemandBatchLineDraft, ProductionDemandPlanning, ProductionDemandProductRow } from "@/api/productionPlanningApi";
import { ProductThumb } from "./ProductThumb";

type Props = {
  data: ProductionDemandPlanning | null;
  loading: boolean;
  error: string | null;
  coverageDays: number;
  customCoverageInput: string;
  onCoverageDaysChange: (days: number) => void;
  onCustomCoverageInputChange: (v: string) => void;
  onApplyCustomCoverage: () => void;
  onReload: () => void;
  onCreateBatch: (lines: DemandBatchLineDraft[], label: string) => void;
};

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: "Krytyczny",
  HIGH: "Wysoki",
  MEDIUM: "Średni",
  LOW: "Niski",
};

const PRIORITY_CLASS: Record<string, string> = {
  CRITICAL: "bg-rose-100 text-rose-800 ring-rose-200",
  HIGH: "bg-orange-100 text-orange-900 ring-orange-200",
  MEDIUM: "bg-amber-50 text-amber-900 ring-amber-200",
  LOW: "bg-slate-100 text-slate-700 ring-slate-200",
};

const COVERAGE_CLASS: Record<string, string> = {
  red: "text-rose-700",
  orange: "text-amber-700",
  green: "text-emerald-700",
  blue: "text-blue-700",
};

function linesFromRows(
  rows: ProductionDemandProductRow[],
  pickQty: (r: ProductionDemandProductRow) => number,
): DemandBatchLineDraft[] {
  return rows
    .filter((r) => r.composition_id != null && pickQty(r) > 0)
    .map((r) => ({
      product_id: r.product_id,
      composition_id: r.composition_id!,
      planned_quantity: pickQty(r),
    }));
}

export function ProductionDemandPlanningPanel({
  data,
  loading,
  error,
  coverageDays,
  customCoverageInput,
  onCoverageDaysChange,
  onCustomCoverageInputChange,
  onApplyCustomCoverage,
  onReload,
  onCreateBatch,
}: Props) {
  const summary = data?.summary;
  const products = data?.products ?? [];
  const presets = data?.coverage_day_presets ?? [7, 14, 21, 30, 45, 60, 90];

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Planowanie zapotrzebowania</h3>
          <p className="mt-1 text-sm text-slate-500">
            MRP — zapotrzebowanie z zamówień i utrzymanie zapasu na {coverageDays} dni (średnia z ostatnich{" "}
            {data?.sales_lookback_days ?? 30} dni sprzedaży).
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => onReload()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Odśwież
        </button>
      </div>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <DemandCard
          icon={<ShoppingCart className="h-5 w-5 text-violet-600" aria-hidden />}
          title="Na zamówienia"
          subtitle="Na dzisiejsze zamówienia"
          value={summary?.order_demand_total ?? 0}
          unit="szt."
          detail={
            summary && summary.order_production_needed > 0
              ? `Do produkcji (po stanie): ${fmtQty(summary.order_production_needed)} szt.`
              : undefined
          }
          loading={loading}
          onCreate={() =>
            onCreateBatch(linesFromRows(products, (r) => r.order_production_needed), "zamówienia")
          }
        />

        <DemandCard
          icon={<TrendingUp className="h-5 w-5 text-emerald-600" aria-hidden />}
          title="Na utrzymanie zapasu"
          subtitle={`Zapas na ${coverageDays} dni sprzedaży`}
          value={summary?.forecast_production_needed ?? 0}
          unit="szt. potrzeba"
          loading={loading}
          extra={
            <CoveragePicker
              presets={presets}
              coverageDays={coverageDays}
              customCoverageInput={customCoverageInput}
              onCoverageDaysChange={onCoverageDaysChange}
              onCustomCoverageInputChange={onCustomCoverageInputChange}
              onApplyCustomCoverage={onApplyCustomCoverage}
            />
          }
          onCreate={() =>
            onCreateBatch(linesFromRows(products, (r) => r.forecast_production_needed), "zapas")
          }
        />

        <DemandCard
          icon={<Package className="h-5 w-5 text-indigo-600" aria-hidden />}
          title="Łączne zapotrzebowanie"
          subtitle="Brak końcowy (oba źródła)"
          value={summary?.combined_production_needed ?? 0}
          unit="szt. do produkcji"
          loading={loading}
          detail={
            summary
              ? `Zamówienia: ${fmtQty(summary.order_demand_total)} · Prognoza brak: ${fmtQty(
                  summary.forecast_production_needed,
                )} · Stan: ${fmtQty(summary.on_hand_total)} · W produkcji: ${fmtQty(summary.in_pipeline_total)}`
              : undefined
          }
          onCreate={() =>
            onCreateBatch(linesFromRows(products, (r) => r.combined_production_needed), "łącznie")
          }
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Produkt</th>
              <th className="px-3 py-3">SKU</th>
              <th className="px-3 py-3 text-right">Stan</th>
              <th className="px-3 py-3 text-right">Śr. / dzień</th>
              <th className="px-3 py-3 text-right">Pokrycie</th>
              <th className="px-3 py-3 text-right">W prod.</th>
              <th className="px-3 py-3 text-right">Zamów.</th>
              <th className="px-3 py-3 text-right">Prognoza</th>
              <th className="px-3 py-3 text-right">Do prod.</th>
              <th className="px-3 py-3">Priorytet</th>
              <th className="px-3 py-3">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && products.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                  Wczytywanie…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                  Brak aktywnych receptur produkcyjnych w tym magazynie.
                </td>
              </tr>
            ) : (
              products.map((row) => (
                <tr key={row.product_id} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ProductThumb imageUrl={row.product_image_url} name={row.product_name} size="sm" />
                      <span className="font-semibold text-slate-900">{row.product_name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.product_sku ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.on_hand)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.avg_daily_sales.toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${COVERAGE_CLASS[row.coverage_color] ?? ""}`}>
                    {row.coverage_days != null ? `${row.coverage_days.toFixed(0)} dni` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.in_pipeline)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.order_demand)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.forecast_demand)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-indigo-700">
                    {fmtQty(row.combined_production_needed)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${PRIORITY_CLASS[row.priority] ?? PRIORITY_CLASS.LOW}`}
                    >
                      {PRIORITY_LABEL[row.priority] ?? row.priority}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.composition_id && row.combined_production_needed > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          onCreateBatch(
                            [
                              {
                                product_id: row.product_id,
                                composition_id: row.composition_id!,
                                planned_quantity: row.combined_production_needed,
                              },
                            ],
                            row.product_name,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-violet-700"
                      >
                        <Factory className="h-3.5 w-3.5" aria-hidden />
                        Partia
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DemandCard({
  icon,
  title,
  subtitle,
  value,
  unit,
  detail,
  extra,
  loading,
  onCreate,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  value: number;
  unit: string;
  detail?: string;
  extra?: ReactNode;
  loading?: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      {extra ? <div className="mt-3">{extra}</div> : null}
      <p className="mt-4 text-4xl font-black tabular-nums text-slate-900">
        {loading ? "…" : fmtQty(value)}
        <span className="ml-1 text-sm font-semibold text-slate-500">{unit}</span>
      </p>
      {detail ? <p className="mt-2 text-xs text-slate-600">{detail}</p> : null}
      <button
        type="button"
        disabled={loading || value <= 0}
        onClick={onCreate}
        className="mt-4 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40"
      >
        Utwórz partię
      </button>
    </div>
  );
}

function CoveragePicker({
  presets,
  coverageDays,
  customCoverageInput,
  onCoverageDaysChange,
  onCustomCoverageInputChange,
  onApplyCustomCoverage,
}: {
  presets: number[];
  coverageDays: number;
  customCoverageInput: string;
  onCoverageDaysChange: (d: number) => void;
  onCustomCoverageInputChange: (v: string) => void;
  onApplyCustomCoverage: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onCoverageDaysChange(d)}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
              coverageDays === d ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min={1}
          max={365}
          placeholder="Inne dni"
          value={customCoverageInput}
          onChange={(e) => onCustomCoverageInputChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={onApplyCustomCoverage}
          className="shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          OK
        </button>
      </div>
    </div>
  );
}
