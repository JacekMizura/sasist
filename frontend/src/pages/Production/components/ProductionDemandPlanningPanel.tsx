import { useState, Fragment } from "react";
import { ChevronDown, Factory } from "lucide-react";

import type {
  DemandBatchLineDraft,
  ProductionDemandPlanning,
  ProductionDemandProductRow,
  ProductionPlanningPriority,
} from "@/api/productionPlanningApi";
import {
  Card,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  typography,
  type StatusTone,
} from "@/design-system";
import { SettingInfoButton } from "../../Settings/SettingInfoButton";
import { ProductThumb } from "./ProductThumb";
import { MaterialProductionStatusBadge } from "./MaterialProductionStatusBadge";
import { productionSectionLabelClass } from "../productionLayoutTokens";
import { buildPlanningQtyBreakdown } from "../productionPlanningBreakdown";
import { formatProductionQuantity } from "../productionUi";

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
  return formatProductionQuantity(n);
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

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className={productionSectionLabelClass}>Parametry planowania</p>
            <SettingInfoButton
              title="Parametry planowania"
              description={
                <ul>
                  <li>Okres planowania określa, na ile dni do przodu system analizuje zapotrzebowanie.</li>
                  <li>Sprzedaż z ostatnich X dni służy do wyliczenia średniego tempa sprzedaży.</li>
                  <li>Pokrycie zapasu określa, jaki zapas system próbuje utrzymać.</li>
                  <li>
                    Automatyczne uzupełnianie może cyklicznie tworzyć zapotrzebowanie produkcyjne zgodnie z
                    aktualnymi ustawieniami.
                  </li>
                </ul>
              }
              tip={
                <p>
                  Zmiana parametrów wpływa na rekomendowane ilości, ale nie zmienia istniejących zleceń
                  produkcyjnych.
                </p>
              }
            />
          </div>
          <p className="text-sm text-slate-700">
            Okres planowania: <span className="font-semibold tabular-nums">{coverageDays} dni</span>
            {data?.sales_lookback_days != null ? (
              <>
                {" "}
                · Sprzedaż z ostatnich{" "}
                <span className="font-semibold tabular-nums">{data.sales_lookback_days} dni</span>
              </>
            ) : null}
            {data?.forecast_strategy_label ? (
              <>
                {" "}
                · Metoda: <span className="font-medium">{data.forecast_strategy_label}</span>
              </>
            ) : null}
          </p>
          <p className="text-xs text-slate-500">
            {autoReplenish ? (
              <>
                Automatyczne uzupełnianie: włączone
                {replenishCoverage != null ? ` · Pokrycie zapasu: ${replenishCoverage} ${replenishCoverage === 1 ? "dzień" : "dni"}` : ""}
                {intervalLabel ? ` · Przeliczanie: ${intervalLabel}` : ""}
                {lastRunLabel ? ` · Ostatnio: ${lastRunLabel}` : ""}
              </>
            ) : (
              "Automatyczne uzupełnianie: wyłączone (ustawienia produkcji WMS)"
            )}
            {dash != null ? (
              <>
                {" "}
                · Krytyczne: <span className="font-semibold tabular-nums">{dash.critical_products}</span>
                {" · "}
                Braki materiałów:{" "}
                <span className="font-semibold tabular-nums">{dash.material_shortage_products}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CoveragePicker
            presets={presets}
            coverageDays={coverageDays}
            customCoverageInput={customCoverageInput}
            onCoverageDaysChange={onCoverageDaysChange}
            onCustomCoverageInputChange={onCustomCoverageInputChange}
            onApplyCustomCoverage={onApplyCustomCoverage}
          />
          {onRecalculateDemand ? (
            <SecondaryButton
              type="button"
              density="comfortable"
              disabled={loading || replenishmentRunning}
              onClick={onRecalculateDemand}
            >
              Przelicz
            </SecondaryButton>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className={productionSectionLabelClass}>Rekomendacje</h3>
              <SettingInfoButton
                title="Rekomendacje produkcji"
                description={
                  <ul>
                    <li>
                      System porównuje zapotrzebowanie, aktualny stan i ilości już będące w produkcji.
                    </li>
                    <li>Na tej podstawie wylicza rekomendowaną ilość do wyprodukowania.</li>
                    <li>
                      Dostępność materiałów może ograniczyć możliwość wykonania pełnej rekomendacji.
                    </li>
                  </ul>
                }
                tip={
                  <p>
                    Szczegółowe wartości wykorzystane do wyliczenia znajdziesz w tabeli zapotrzebowania
                    poniżej.
                  </p>
                }
              />
            </div>
            <p className={`mt-0.5 ${typography.caption}`}>
              Zapotrzebowanie → Stan → W produkcji → Rekomendacja
            </p>
          </div>
          {autoReplenish && onCreateReplenishmentOrders ? (
            <PrimaryButton
              type="button"
              density="comfortable"
              disabled={replenishmentRunning || replenishRecommendations.length === 0}
              onClick={onCreateReplenishmentOrders}
            >
              {replenishmentRunning ? "Tworzenie…" : "Utwórz zlecenia z planu"}
            </PrimaryButton>
          ) : null}
        </div>

        {loading && recommendations.length === 0 ? (
          <p className="text-sm text-slate-500">Wczytywanie rekomendacji…</p>
        ) : recommendations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
            Brak produktów wymagających produkcji.
          </p>
        ) : (
          <div className="grid max-h-[16rem] gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
            {recommendations.map((row) => (
              <RecommendationCard
                key={row.product_id}
                row={row}
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
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      <h3 className={productionSectionLabelClass}>Zapotrzebowanie szczegółowe</h3>
      <div className="max-h-[22rem] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2" />
              <th className="px-3 py-2">Produkt</th>
              <th className="px-3 py-2 text-right">Stan</th>
              <th className="px-3 py-2 text-right">W produkcji</th>
              <th className="px-3 py-2 text-right" title="Suma sztuk z otwartych zamówień (brutto)">
                Zamówienia (brutto)
              </th>
              <th className="px-3 py-2 text-right">Uzupełnienie</th>
              <th className="px-3 py-2 text-right">Cel zapasu</th>
              <th className="px-3 py-2 text-right">Pokrycie</th>
              <th className="px-3 py-2">Priorytet</th>
              <th className="px-3 py-2">Materiały</th>
              <th className="px-3 py-2">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && products.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-5 text-center text-slate-500">
                  Wczytywanie…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-5 text-center text-slate-500">
                  Brak aktywnych receptur produkcyjnych.
                </td>
              </tr>
            ) : (
              products.map((row) => {
                const expanded = expandedId === row.product_id;
                const breakdown = buildPlanningQtyBreakdown({
                  on_hand: row.on_hand,
                  in_pipeline: row.in_pipeline,
                  order_demand: row.order_demand,
                  forecast_demand: row.forecast_demand,
                  stock_replenishment_needed: row.stock_replenishment_needed,
                  order_production_needed: row.order_production_needed,
                  production_moq: row.production_moq,
                  production_batch_multiple: row.production_batch_multiple,
                  recommended_quantity: row.recommended_quantity,
                  max_producible: row.max_producible,
                });
                return (
                  <Fragment key={row.product_id}>
                    <tr className="align-middle hover:bg-slate-50/80">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                          aria-expanded={expanded}
                          aria-label="Dlaczego taka ilość?"
                          onClick={() => setExpandedId(expanded ? null : row.product_id)}
                        >
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                            aria-hidden
                          />
                        </button>
                      </td>
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
                            compact
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
                    {expanded ? (
                      <tr className="bg-slate-50/80">
                        <td colSpan={11} className="px-3 py-3">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Dlaczego taka ilość?
                          </p>
                          <dl className="grid max-w-xl grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-xs text-slate-700">
                            {breakdown.map((line) => (
                              <Fragment key={line.key}>
                                <dt
                                  className={
                                    line.key === "recommended" || line.key === "formula"
                                      ? "font-bold text-slate-900"
                                      : ""
                                  }
                                >
                                  <span>{line.label}</span>
                                  {line.hint ? (
                                    <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                                      {line.hint}
                                    </span>
                                  ) : null}
                                </dt>
                                <dd
                                  className={`text-right tabular-nums ${
                                    line.key === "recommended" || line.key === "formula"
                                      ? "font-bold text-slate-900"
                                      : ""
                                  } ${line.key === "formula" ? "max-w-[14rem] whitespace-normal text-left sm:text-right" : ""}`}
                                >
                                  {typeof line.value === "number" ? fmtQty(line.value) : line.value}
                                </dd>
                              </Fragment>
                            ))}
                          </dl>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecommendationCard({
  row,
  onCreateBatch,
}: {
  row: ProductionDemandProductRow;
  onCreateBatch: (lines: DemandBatchLineDraft[], label: string) => void;
}) {
  const demand = Math.max(row.order_demand || 0, row.forecast_demand || 0);
  const materialCapped =
    row.max_producible >= 0 &&
    row.recommended_quantity > 0 &&
    row.max_producible + 1e-6 < row.recommended_quantity;

  return (
    <Card variant="section" density="compact" className="flex flex-col gap-2.5 !p-3">
      <div className="flex items-center gap-3">
        <ProductThumb imageUrl={row.product_image_url} name={row.product_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{row.product_name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={PRIORITY_TONE[row.priority]} density="compact">
              {PRIORITY_LABEL[row.priority]}
            </StatusBadge>
            {row.material_status !== "OK" ? (
              <span className="inline-flex items-center gap-1">
                <MaterialProductionStatusBadge status={row.material_status} compact />
                <SettingInfoButton
                  title="Brak materiałów"
                  description={
                    <ul>
                      <li>
                        Brakuje jednego lub kilku komponentów potrzebnych do wykonania pełnej rekomendowanej
                        ilości.
                      </li>
                      <li>
                        Produkcja może być ograniczona do ilości możliwej przy aktualnie dostępnych
                        materiałach.
                      </li>
                    </ul>
                  }
                  tip={
                    <p>
                      Sprawdź zakładkę Materiały, aby zobaczyć konkretne niedobory i zlecenia wymagające materiału.
                    </p>
                  }
                />
              </span>
            ) : (
              <MaterialProductionStatusBadge status={row.material_status} compact />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-50 px-2 py-2 text-center text-[11px]">
        <div>
          <p className="font-bold uppercase tracking-wide text-slate-400">Zapotrzebowanie</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{fmtQty(demand)}</p>
        </div>
        <div>
          <p className="font-bold uppercase tracking-wide text-slate-400">Stan</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{fmtQty(row.on_hand)}</p>
        </div>
        <div>
          <p className="font-bold uppercase tracking-wide text-slate-400">W produkcji</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{fmtQty(row.in_pipeline)}</p>
        </div>
        <div>
          <p className="font-bold uppercase tracking-wide text-orange-500">Rekomendacja</p>
          <p className="mt-0.5 text-base font-bold tabular-nums text-orange-800">
            {fmtQty(row.recommended_quantity)}
          </p>
        </div>
      </div>

      {materialCapped ? (
        <p className="text-xs text-slate-600">Przy obecnych materiałach maks. {fmtQty(row.max_producible)} szt.</p>
      ) : null}

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
        Utwórz zlecenie
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
