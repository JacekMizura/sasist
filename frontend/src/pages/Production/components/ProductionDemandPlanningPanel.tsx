import {
  AlertTriangle,
  Factory,
  FlaskConical,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";

import type {
  DemandBatchLineDraft,
  ProductionDemandPlanning,
  ProductionDemandProductRow,
} from "@/api/productionPlanningApi";
import { ProductThumb } from "./ProductThumb";
import { ProductionTimelineChart } from "./ProductionTimelineChart";
import { MaterialProductionStatusBadge } from "./MaterialProductionStatusBadge";

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
  onSimulate: () => void;
  simulateBusy: boolean;
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
  onSimulate,
  simulateBusy,
  onCreateBatch,
}: Props) {
  const dash = data?.dashboard;
  const products = data?.products ?? [];
  const presets = data?.coverage_day_presets ?? [7, 14, 21, 30, 45, 60, 90];

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Planowanie zapotrzebowania</h3>
          <p className="mt-1 text-sm text-slate-500">
            Strategia: <strong>{data?.forecast_strategy_label ?? "—"}</strong> · horyzont {coverageDays} dni · magazyn #
            {data?.warehouse_id ?? "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || simulateBusy}
            onClick={onSimulate}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
          >
            <FlaskConical className="h-4 w-4" aria-hidden />
            Symuluj plan produkcji
          </button>
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
      </div>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Produkty krytyczne" value={dash?.critical_products ?? 0} tone="rose" />
        <Kpi label="Do produkcji dziś" value={dash?.production_needed_today ?? 0} />
        <Kpi label="Brak surowców" value={dash?.material_shortage_products ?? 0} tone="amber" />
        <Kpi label="Rekom. produkcja" value={fmtQty(dash?.total_recommended_quantity ?? 0)} suffix="szt." />
        <Kpi
          label="Śr. pokrycie"
          value={dash?.average_coverage_days != null ? `${dash.average_coverage_days.toFixed(0)} dni` : "—"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <DemandCard
          icon={<ShoppingCart className="h-5 w-5 text-violet-600" aria-hidden />}
          title="Na zamówienia"
          subtitle="Na dzisiejsze zamówienia"
          value={dash?.order_demand_total ?? 0}
          unit="szt."
          loading={loading}
          onCreate={() => onCreateBatch(linesFromRows(products, (r) => r.order_production_needed), "zamówienia")}
        />
        <DemandCard
          icon={<TrendingUp className="h-5 w-5 text-emerald-600" aria-hidden />}
          title="Na utrzymanie zapasu"
          subtitle={`Zapas na ${coverageDays} dni`}
          value={products.reduce((a, p) => a + p.forecast_production_needed, 0)}
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
          title="Łączna rekomendacja"
          subtitle="Brak końcowy (oba źródła)"
          value={dash?.total_recommended_quantity ?? 0}
          unit="szt."
          loading={loading}
          onCreate={() =>
            onCreateBatch(linesFromRows(products, (r) => r.recommended_quantity), "łącznie")
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
              <th className="px-3 py-3 text-right">W prod.</th>
              <th className="px-3 py-3 text-right">Zamów.</th>
              <th className="px-3 py-3 text-right">Prognoza</th>
              <th className="px-3 py-3 text-right">Pokrycie</th>
              <th className="px-3 py-3 text-right">Min</th>
              <th className="px-3 py-3 text-right">LT</th>
              <th className="px-3 py-3 text-right">Można</th>
              <th className="px-3 py-3">Materiały</th>
              <th className="px-3 py-3 text-right">Rekom.</th>
              <th className="px-3 py-3">Priorytet</th>
              <th className="px-3 py-3">Dlaczego?</th>
              <th className="px-3 py-3">Oś czasu</th>
              <th className="px-3 py-3">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && products.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-3 py-8 text-center text-slate-500">
                  Wczytywanie…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-3 py-8 text-center text-slate-500">
                  Brak aktywnych receptur produkcyjnych.
                </td>
              </tr>
            ) : (
              products.map((row) => (
                <tr key={row.product_id} className="align-top hover:bg-slate-50/80">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ProductThumb imageUrl={row.product_image_url} name={row.product_name} size="sm" />
                      <span className="max-w-[140px] font-semibold text-slate-900">{row.product_name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.product_sku ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.on_hand)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.in_pipeline)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.order_demand)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.forecast_demand)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${COVERAGE_CLASS[row.coverage_color] ?? ""}`}>
                    {row.coverage_days != null ? `${row.coverage_days.toFixed(0)} d` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {row.min_stock != null ? fmtQty(row.min_stock) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.production_lead_time_days || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.max_producible > 0 ? (
                      fmtQty(row.max_producible)
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-amber-700">
                        <AlertTriangle className="h-3 w-3" aria-hidden />0
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.recommended_quantity > 0 ? (
                      <MaterialProductionStatusBadge
                        status={row.material_status ?? "OK"}
                        producibleNow={row.producible_now_qty}
                        waitingQty={row.waiting_qty}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-indigo-700">
                    {fmtQty(row.recommended_quantity)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${PRIORITY_CLASS[row.priority] ?? PRIORITY_CLASS.LOW}`}
                    >
                      {PRIORITY_LABEL[row.priority] ?? row.priority}
                    </span>
                  </td>
                  <td className="max-w-[140px] px-3 py-2 text-xs text-slate-600">
                    {row.recommendation_reasons.length ? row.recommendation_reasons.join(" · ") : "—"}
                  </td>
                  <td className="min-w-[120px] px-3 py-2">
                    <ProductionTimelineChart points={row.timeline} />
                  </td>
                  <td className="px-3 py-2">
                    {row.composition_id && row.recommended_quantity > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          onCreateBatch(
                            [
                              {
                                product_id: row.product_id,
                                composition_id: row.composition_id!,
                                planned_quantity: row.recommended_quantity,
                              },
                            ],
                            row.product_name,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700"
                      >
                        <Factory className="h-3.5 w-3.5" aria-hidden />
                        Partia
                      </button>
                    ) : (
                      "—"
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

function Kpi({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  tone?: "rose" | "amber";
}) {
  const toneClass =
    tone === "rose" ? "border-rose-200 bg-rose-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white";
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
        {value}
        {suffix ? <span className="ml-1 text-sm font-semibold text-slate-500">{suffix}</span> : null}
      </p>
    </div>
  );
}

function DemandCard({
  icon,
  title,
  subtitle,
  value,
  unit,
  extra,
  loading,
  onCreate,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  value: number;
  unit: string;
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
