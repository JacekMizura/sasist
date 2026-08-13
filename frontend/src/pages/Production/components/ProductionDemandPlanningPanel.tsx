import { Factory } from "lucide-react";

import type {
  DemandBatchLineDraft,
  ProductionDemandPlanning,
  ProductionDemandProductRow,
  ProductionPlanningPriority,
} from "@/api/productionPlanningApi";
import {
  Card,
  MetricCard,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  typography,
  type StatusTone,
} from "@/design-system";
import { ProductThumb } from "./ProductThumb";
import { MaterialProductionStatusBadge } from "./MaterialProductionStatusBadge";
import { productionSectionLabelClass } from "../productionLayoutTokens";

type Props = {
  data: ProductionDemandPlanning | null;
  loading: boolean;
  error: string | null;
  coverageDays: number;
  customCoverageInput: string;
  onCoverageDaysChange: (days: number) => void;
  onCustomCoverageInputChange: (v: string) => void;
  onApplyCustomCoverage: () => void;
  onCreateBatch: (lines: DemandBatchLineDraft[], label: string) => void;
  onRecalculateDemand?: () => void;
  onCreateReplenishmentOrders?: () => void;
  replenishmentRunning?: boolean;
};

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const PRIORITY_LABEL: Record<ProductionPlanningPriority, string> = {
  CRITICAL: "Krytyczny",
  HIGH: "Wysoki",
  MEDIUM: "Średni",
  LOW: "Niski",
};

const PRIORITY_TONE: Record<ProductionPlanningPriority, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "neutral",
};

const COVERAGE_CLASS: Record<string, string> = {
  red: "text-rose-700",
  orange: "text-amber-700",
  green: "text-emerald-700",
  blue: "text-blue-700",
};

const PRIORITY_RANK: Record<ProductionPlanningPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function ProductionDemandPlanningPanel({
  data,
  loading,
  error,
  coverageDays,
  customCoverageInput,
  onCoverageDaysChange,
  onCustomCoverageInputChange,
  onApplyCustomCoverage,
  onCreateBatch,
  onRecalculateDemand,
  onCreateReplenishmentOrders,
  replenishmentRunning = false,
}: Props) {
  const dash = data?.dashboard;
  const products = data?.products ?? [];
  const presets = data?.coverage_day_presets ?? [7, 14, 21, 30, 45, 60, 90];
  const autoReplenish = Boolean(data?.auto_stock_replenishment);
  const replenishCoverage = data?.stock_replenishment_coverage_days ?? null;
  const replenishInterval = data?.stock_replenishment_interval ?? null;
  const lastReplenishAt = data?.last_replenishment_run_at ?? null;

  const intervalLabel =
    replenishInterval === "hourly"
      ? "co godzinę"
      : replenishInterval === "every_3_hours"
        ? "co 3 godziny"
        : replenishInterval === "every_6_hours"
          ? "co 6 godzin"
          : replenishInterval === "daily"
            ? "raz dziennie"
            : null;

  function formatLastRun(iso: string | null): string | null {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      const today = new Date();
      const sameDay =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
      const time = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
      if (sameDay) return `dzisiaj ${time}`;
      return d.toLocaleString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  }

  const lastRunLabel = formatLastRun(lastReplenishAt);

  const recommendations = products
    .filter((r) => r.recommended_quantity > 0 && r.composition_id != null)
    .slice()
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.recommended_quantity - a.recommended_quantity);

  const replenishRecommendations = products.filter(
    (r) => (r.stock_replenishment_needed ?? 0) > 0 && r.composition_id != null,
  );

  return (
    <section className="space-y-4">
      {error ? <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-sm text-rose-800">{error}</p> : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          density="compact"
          label="Produkty krytyczne"
          value={dash?.critical_products ?? 0}
          className="!py-2.5"
        />
        <MetricCard
          density="compact"
          label="Do produkcji dzisiaj"
          value={dash?.production_needed_today ?? 0}
          className="!py-2.5"
        />
        <MetricCard
          density="compact"
          label="Brak surowców"
          value={dash?.material_shortage_products ?? 0}
          className="!py-2.5"
        />
        <MetricCard
          density="compact"
          label="Średnie pokrycie"
          value={dash?.average_coverage_days != null ? dash.average_coverage_days.toFixed(0) : "—"}
          unit={dash?.average_coverage_days != null ? "dni" : undefined}
          className="!py-2.5"
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className={productionSectionLabelClass}>Rekomendacje produkcji</h3>
            <p className={`mt-0.5 ${typography.caption}`}>
              Horyzont {coverageDays} dni
              {data?.forecast_strategy_label ? ` · ${data.forecast_strategy_label}` : ""}
              {autoReplenish && replenishCoverage != null
                ? ` · uzupełnienie zapasu: ${replenishCoverage} dni`
                : ""}
            </p>
            {autoReplenish ? (
              <p className={`mt-1 ${typography.caption} text-slate-500`}>
                Automatyczne uzupełnianie: aktywne
                {replenishCoverage != null ? ` · Pokrycie: ${replenishCoverage} dni` : ""}
                {intervalLabel ? ` · Przeliczanie: ${intervalLabel}` : ""}
                {lastRunLabel ? ` · Ostatnie przeliczenie: ${lastRunLabel}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onRecalculateDemand ? (
              <SecondaryButton
                type="button"
                density="comfortable"
                disabled={loading || replenishmentRunning}
                onClick={onRecalculateDemand}
              >
                Przelicz zapotrzebowanie
              </SecondaryButton>
            ) : null}
            {autoReplenish && onCreateReplenishmentOrders ? (
              <PrimaryButton
                type="button"
                density="comfortable"
                disabled={replenishmentRunning || replenishRecommendations.length === 0}
                onClick={onCreateReplenishmentOrders}
              >
                {replenishmentRunning ? "Tworzenie…" : "Utwórz zlecenia"}
              </PrimaryButton>
            ) : null}
            <CoveragePicker
              presets={presets}
              coverageDays={coverageDays}
              customCoverageInput={customCoverageInput}
              onCoverageDaysChange={onCoverageDaysChange}
              onCustomCoverageInputChange={onCustomCoverageInputChange}
              onApplyCustomCoverage={onApplyCustomCoverage}
            />
          </div>
        </div>

        {loading && recommendations.length === 0 ? (
          <p className="text-sm text-slate-500">Wczytywanie rekomendacji…</p>
        ) : recommendations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
            Brak produktów wymagających uzupełnienia zapasu.
          </p>
        ) : (
          <div className="grid max-h-[13.5rem] gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
            {recommendations.map((row) => (
              <RecommendationCard
                key={row.product_id}
                row={row}
                replenishCoverageDays={replenishCoverage ?? coverageDays}
                onCreateBatch={onCreateBatch}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Full demand table — rendered below the decision stack on the planning page. */
export function ProductionDemandProductsTable({
  products,
  loading,
  onCreateBatch,
}: {
  products: ProductionDemandProductRow[];
  loading: boolean;
  onCreateBatch: (lines: DemandBatchLineDraft[], label: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className={productionSectionLabelClass}>Zapotrzebowanie produktów</h3>
      <div className="max-h-[18rem] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Produkt</th>
              <th className="px-3 py-2 text-right">Stan</th>
              <th className="px-3 py-2 text-right">W produkcji</th>
              <th className="px-3 py-2 text-right">Zamówienia</th>
              <th className="px-3 py-2 text-right">Uzupełnienie</th>
              <th className="px-3 py-2 text-right">Prognoza</th>
              <th className="px-3 py-2 text-right">Pokrycie</th>
              <th className="px-3 py-2">Priorytet</th>
              <th className="px-3 py-2">Materiały</th>
              <th className="px-3 py-2">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && products.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-5 text-center text-slate-500">
                  Wczytywanie…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-5 text-center text-slate-500">
                  Brak aktywnych receptur produkcyjnych.
                </td>
              </tr>
            ) : (
              products.map((row) => (
                <tr key={row.product_id} className="align-middle hover:bg-slate-50/80">
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <ProductThumb imageUrl={row.product_image_url} name={row.product_name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{row.product_name}</p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {row.has_order_demand || row.order_demand > 0 ? (
                            <StatusBadge tone="warning" density="compact">
                              Zamówienia
                            </StatusBadge>
                          ) : null}
                          {row.has_stock_replenishment || (row.stock_replenishment_needed ?? 0) > 0 ? (
                            <StatusBadge tone="info" density="compact">
                              Uzupełnienie zapasu
                            </StatusBadge>
                          ) : null}
                        </div>
                        {row.product_sku ? (
                          <p className="truncate font-mono text-xs text-slate-500">{row.product_sku}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.on_hand)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.in_pipeline)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.order_demand)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtQty(row.stock_replenishment_needed ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.forecast_demand)}</td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${COVERAGE_CLASS[row.coverage_color] ?? ""}`}
                  >
                    {row.coverage_days != null ? `${row.coverage_days.toFixed(0)} d` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={PRIORITY_TONE[row.priority]} density="compact">
                      {PRIORITY_LABEL[row.priority]}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2">
                    {row.recommended_quantity > 0 ? (
                      <MaterialProductionStatusBadge
                        status={row.material_status ?? "OK"}
                        description={row.material_status_description}
                        producibleNow={row.producible_now_qty}
                        waitingQty={row.waiting_qty}
                        limitingComponentName={row.limiting_component_name}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.composition_id && row.recommended_quantity > 0 ? (
                      <PrimaryButton
                        type="button"
                        density="compact"
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
                      >
                        <Factory className="h-3.5 w-3.5" aria-hidden />
                        Utwórz partię
                      </PrimaryButton>
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
    </div>
  );
}

function RecommendationCard({
  row,
  replenishCoverageDays,
  onCreateBatch,
}: {
  row: ProductionDemandProductRow;
  replenishCoverageDays: number;
  onCreateBatch: (lines: DemandBatchLineDraft[], label: string) => void;
}) {
  const orderNeed = row.order_production_needed ?? 0;
  const stockNeed = row.stock_replenishment_needed ?? row.forecast_production_needed ?? 0;
  const showOrder = Boolean(row.has_order_demand) || orderNeed > 0 || row.order_demand > 0;
  const showStock = Boolean(row.has_stock_replenishment) || stockNeed > 0;
  const target = row.forecast_demand;
  const materialCapped =
    row.max_producible >= 0 &&
    row.recommended_quantity > 0 &&
    row.max_producible + 1e-6 < row.recommended_quantity;

  return (
    <Card variant="section" density="compact" className="flex flex-col gap-2 !p-3">
      <div className="flex items-start gap-2">
        <ProductThumb imageUrl={row.product_image_url} name={row.product_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{row.product_name}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <StatusBadge tone={PRIORITY_TONE[row.priority]} density="compact">
              {PRIORITY_LABEL[row.priority]}
            </StatusBadge>
            {showOrder ? (
              <StatusBadge tone="warning" density="compact">
                Na zamówienia
              </StatusBadge>
            ) : null}
            {showStock ? (
              <StatusBadge tone="info" density="compact">
                Na magazyn
              </StatusBadge>
            ) : null}
          </div>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-lg font-bold tabular-nums text-slate-900">{fmtQty(row.recommended_quantity)}</span>
          <span className={typography.caption}>razem</span>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
        <dt>Stan</dt>
        <dd className="text-right tabular-nums">{fmtQty(row.on_hand)} szt.</dd>
        <dt>Sprzedaż</dt>
        <dd className="text-right tabular-nums">{fmtQty(row.avg_daily_sales)} /dzień</dd>
        <dt>Pokrycie</dt>
        <dd className={`text-right tabular-nums font-medium ${COVERAGE_CLASS[row.coverage_color] ?? ""}`}>
          {row.coverage_days != null ? `${row.coverage_days.toFixed(0)} dni` : "—"}
        </dd>
        <dt>Cel ({replenishCoverageDays} dni)</dt>
        <dd className="text-right tabular-nums">{fmtQty(target)} szt.</dd>
        <dt>W produkcji</dt>
        <dd className="text-right tabular-nums">{fmtQty(row.in_pipeline)} szt.</dd>
        <dt className="font-semibold text-amber-800">Na zamówienia</dt>
        <dd className="text-right font-semibold tabular-nums text-amber-900">{fmtQty(orderNeed)} szt.</dd>
        <dt className="font-semibold text-sky-800">Na magazyn</dt>
        <dd className="text-right font-semibold tabular-nums text-sky-900">{fmtQty(stockNeed)} szt.</dd>
        <dt className="font-bold text-slate-900">Razem</dt>
        <dd className="text-right font-bold tabular-nums text-slate-900">{fmtQty(row.recommended_quantity)} szt.</dd>
      </dl>

      {materialCapped ? (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
          Materiały pozwalają obecnie wyprodukować maks. {fmtQty(row.max_producible)} szt.
        </p>
      ) : null}

      <p className="text-[11px] leading-snug text-slate-500" title="Pierwszeństwo zamówień">
        (i) Produkcja dla istniejących zamówień ma pierwszeństwo przed uzupełnianiem zapasu.
      </p>

      <PrimaryButton
        type="button"
        density="comfortable"
        className="mt-auto w-full"
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
      >
        Utwórz partię
      </PrimaryButton>
    </Card>
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
  const shortPresets = presets.filter((d) => [7, 14, 30, 60].includes(d) || d === coverageDays).slice(0, 6);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shortPresets.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onCoverageDaysChange(d)}
          className={`rounded-md px-2 py-1 text-xs font-semibold ${
            coverageDays === d ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {d}d
        </button>
      ))}
      <input
        type="number"
        min={1}
        max={365}
        placeholder="dni"
        value={customCoverageInput}
        onChange={(e) => onCustomCoverageInputChange(e.target.value)}
        className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs"
        aria-label="Własny horyzont pokrycia"
      />
      <SecondaryButton type="button" density="compact" onClick={onApplyCustomCoverage}>
        OK
      </SecondaryButton>
    </div>
  );
}
