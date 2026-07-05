import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Clock,
  Factory,
  Package,
  PackageCheck,
  Percent,
  TrendingUp,
} from "lucide-react";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { fetchProductionDashboard, type ProductionBatchSummaryRead, type ProductionDashboardRead } from "../../api/productionApi";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { AppEmptyState } from "../../components/app-shell";
import { ProductionDashboardBatchGrid } from "./components/ProductionDashboardBatchGrid";
import { ProductionKpiCard } from "./components/ProductionKpiCard";
import { ProductionKpiGrid } from "./components/ProductionKpiGrid";
import { PurchasingTableSection } from "../../modules/purchasing/ui";
import { productionPageStackClass, productionTableTdClass, productionTableThClass } from "./productionLayoutTokens";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "./productionUi";
import { ProductThumb } from "./components/ProductThumb";

const DEFAULT_TENANT = 1;

function ReadyBatchRow({ batch }: { batch: ProductionBatchSummaryRead }) {
  const label = batch.product_labels?.slice(0, 2).join(", ") || `${batch.products_count} prod.`;
  return (
    <tr className="group transition-colors hover:bg-slate-50/80">
      <td className={productionTableTdClass}>
        <div className="flex items-center gap-2">
          <ProductThumb imageUrl={batch.product_image_urls?.[0]} name={label} size="sm" />
          <div>
            <Link
              to={erpProductionPaths.batch(batch.id)}
              className="font-mono text-sm font-semibold text-slate-900 hover:text-amber-700 hover:underline"
            >
              {batch.number}
            </Link>
            <p className="mt-0.5 text-xs text-slate-500">{label}</p>
          </div>
        </div>
      </td>
      <td className={productionTableTdClass}>
        <span className={batchStatusBadgeClass(batch.status)}>{BATCH_STATUS_LABEL[batch.status]}</span>
      </td>
      <td className={`${productionTableTdClass} text-right tabular-nums text-slate-700`}>{batch.total_planned_units}</td>
      <td className={`${productionTableTdClass} text-right`}>
        <Link
          to={erpProductionPaths.batch(batch.id)}
          className="text-xs font-semibold text-amber-700 opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
        >
          Szczegóły
        </Link>
      </td>
    </tr>
  );
}

function dashboardUnitsInProgress(data: ProductionDashboardRead): number {
  return Math.round(data.units_in_production ?? 0);
}

export default function ProductionDashboardPage() {
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const tenantId = DEFAULT_TENANT;
  const [data, setData] = useState<ProductionDashboardRead | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchProductionDashboard(tenantId, warehouseId));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!hasActiveWarehouse || warehouseId == null) {
    return <ActiveWarehouseRequiredBanner hint="Zlecenia RW/PW i partie produkcyjne są tworzone w aktywnym magazynie." />;
  }

  const ready = data?.ready_to_produce ?? [];
  const blocked = data?.waiting_materials ?? [];
  const active = data?.active ?? data?.in_progress ?? [];
  const awaitingPutaway = data?.awaiting_putaway ?? [];
  const recentlyCompleted = data?.recently_completed ?? [];
  const unitsInProgress = data ? dashboardUnitsInProgress(data) : 0;
  const efficiency = data?.production_efficiency_percent ?? 0;

  return (
    <div className={productionPageStackClass}>
      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie danych…</p>
      ) : data ? (
        <>
          <ProductionKpiGrid>
            <ProductionKpiCard
              title="Zaplanowane partie"
              value={data.planned_batches}
              subtitle="Partie w harmonogramie"
              tone="indigo"
              icon={<ClipboardList aria-hidden />}
              to={erpProductionPaths.planning}
            />
            <ProductionKpiCard
              title="W realizacji"
              value={data.active_batches}
              subtitle="Zbieranie, produkcja, rozlokowanie"
              tone="blue"
              icon={<Factory aria-hidden />}
              to={erpProductionPaths.orders}
            />
            <ProductionKpiCard
              title="Oczekuje na rozlokowanie"
              value={data.awaiting_putaway_batches ?? awaitingPutaway.length}
              subtitle="Gotowe do rozlokowania w WMS"
              tone="emerald"
              icon={<PackageCheck aria-hidden />}
              to={wmsProductionPaths.putaway()}
            />
            <ProductionKpiCard
              title="Braki materiałowe"
              value={data.batches_with_shortages}
              subtitle="Partie zablokowane stanem"
              tone="red"
              icon={<AlertTriangle aria-hidden />}
              to={`${erpProductionPaths.orders}?shortages=1`}
            />
            <ProductionKpiCard
              title="Ukończone dziś"
              value={data.finished_today}
              subtitle="Partie zamknięte dziś"
              tone="emerald"
              icon={<CheckCircle2 aria-hidden />}
              to={erpProductionPaths.history}
            />
            <ProductionKpiCard
              title="Produkcja w toku (szt.)"
              value={unitsInProgress}
              subtitle="Suma zaplanowanych sztuk w toku"
              tone="purple"
              icon={<Package aria-hidden />}
            />
            <ProductionKpiCard
              title="Wartość produkcji w toku"
              value="—"
              subtitle="Wycena po kosztach receptur (wkrótce)"
              tone="amber"
              icon={<Banknote aria-hidden />}
            />
            <ProductionKpiCard
              title="Średni koszt partii"
              value="—"
              subtitle="Na podstawie receptur aktywnych"
              tone="default"
              icon={<TrendingUp aria-hidden />}
              to={erpProductionPaths.analytics}
            />
            <ProductionKpiCard
              title="Efektywność"
              value={`${efficiency}%`}
              subtitle="Udział partii zakończonych dziś"
              tone={efficiency >= 70 ? "emerald" : efficiency >= 40 ? "amber" : "red"}
              icon={<Percent aria-hidden />}
              trend={
                data.finished_today > 0
                  ? { label: `+${data.finished_today} dziś`, sentiment: "good" as const }
                  : undefined
              }
            />
          </ProductionKpiGrid>

          <PurchasingTableSection
            title="Oczekuje na rozlokowanie"
            subtitle={`${awaitingPutaway.length} partii gotowych do rozlokowania`}
            indicatorClass="bg-emerald-500"
            action={
              <Link to={wmsProductionPaths.putaway()} className="text-sm font-medium text-amber-700 hover:text-amber-800">
                Terminal WMS → Rozlokowanie
              </Link>
            }
          >
            <ProductionDashboardBatchGrid
              batches={awaitingPutaway}
              emptyIcon={PackageCheck}
              emptyTitle="Brak partii oczekujących na rozlokowanie"
              emptyDescription="Po zakończeniu produkcji partie pojawią się tutaj przed rozlokowaniem w magazynie."
              emptyAction={
                <Link to={wmsProductionPaths.putaway()} className="text-sm font-semibold text-amber-700 hover:underline">
                  Otwórz terminal rozlokowania
                </Link>
              }
              cardClassName="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
            />
          </PurchasingTableSection>

          <PurchasingTableSection
            title="Partie w realizacji"
            subtitle={`${active.length} aktywnych partii`}
            indicatorClass="bg-sky-500"
            action={
              <Link to={erpProductionPaths.orders} className="text-sm font-medium text-amber-700 hover:text-amber-800">
                Wszystkie zlecenia
              </Link>
            }
          >
            <ProductionDashboardBatchGrid
              batches={active}
              emptyIcon={Factory}
              emptyTitle="Brak partii w realizacji"
              emptyDescription="Aktywne zbieranie, produkcja i rozlokowanie pojawią się tutaj."
              emptyAction={
                <Link to={erpProductionPaths.planning} className="text-sm font-semibold text-amber-700 hover:underline">
                  Planowanie produkcji
                </Link>
              }
            />
          </PurchasingTableSection>

          <PurchasingTableSection
            title="Partie wymagające uwagi"
            subtitle={`${blocked.length} zablokowanych brakami materiałów`}
            indicatorClass="bg-amber-500"
            action={
              blocked.length > 0 ? (
                <Link
                  to={`${erpProductionPaths.orders}?shortages=1`}
                  className="text-sm font-medium text-amber-700 hover:text-amber-800"
                >
                  Przejdź do braków
                </Link>
              ) : undefined
            }
          >
            {blocked.length > 0 ? (
              <>
                <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <p className="font-medium">Partie zablokowane — uzupełnij materiały lub utwórz zapotrzebowanie.</p>
                </div>
                <ProductionDashboardBatchGrid
                  batches={blocked}
                  emptyIcon={AlertTriangle}
                  emptyTitle="Brak partii wymagających uwagi"
                  emptyDescription="Wszystkie aktywne partie mają wystarczające materiały."
                  cardClassName="rounded-lg border border-amber-200 bg-amber-50/30 p-3 shadow-sm transition hover:border-amber-300 hover:shadow-md"
                />
              </>
            ) : (
              <AppEmptyState
                icon={CheckCircle2}
                title="Brak partii wymagających uwagi"
                description="Wszystkie aktywne partie mają wystarczające materiały."
                density="inline"
              />
            )}
          </PurchasingTableSection>

          <PurchasingTableSection
            title="Ostatnio zakończone"
            subtitle={`${recentlyCompleted.length} partii w ostatnim okresie`}
            indicatorClass="bg-slate-400"
            action={
              <Link to={erpProductionPaths.history} className="text-sm font-medium text-amber-700 hover:text-amber-800">
                Pełna historia
              </Link>
            }
          >
            <ProductionDashboardBatchGrid
              batches={recentlyCompleted}
              emptyIcon={Clock}
              emptyTitle="Brak ostatnio zakończonych partii"
              emptyDescription="Zamknięte partie pojawią się tutaj po zakończeniu produkcji."
              emptyAction={
                <Link to={erpProductionPaths.history} className="text-sm font-semibold text-amber-700 hover:underline">
                  Historia produkcji
                </Link>
              }
              cardClassName="rounded-lg border border-slate-200 bg-slate-50/50 p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md"
            />
          </PurchasingTableSection>

          <PurchasingTableSection
            title="Gotowe do wydania do WMS"
            subtitle={`${ready.length} partii gotowych do zbierania`}
            indicatorClass="bg-violet-500"
            action={
              <Link to={wmsProductionPaths.collecting()} className="text-sm font-medium text-amber-700 hover:text-amber-800">
                Terminal WMS → Zbieranie
              </Link>
            }
          >
            {ready.length === 0 ? (
              <AppEmptyState
                title="Brak partii gotowych"
                description="Gdy materiały będą dostępne, partie pojawią się tutaj do przekazania operatorom WMS."
                icon={Package}
                density="inline"
              />
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className={productionTableThClass}>Partia</th>
                    <th className={productionTableThClass}>Status</th>
                    <th className={`${productionTableThClass} text-right`}>Ilość</th>
                    <th className={`${productionTableThClass} text-right`}>Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ready.slice(0, 8).map((b) => (
                    <ReadyBatchRow key={b.id} batch={b} />
                  ))}
                </tbody>
              </table>
            )}
          </PurchasingTableSection>
        </>
      ) : (
        <p className="text-sm text-rose-600">Nie udało się wczytać pulpitu produkcji.</p>
      )}
    </div>
  );
}
