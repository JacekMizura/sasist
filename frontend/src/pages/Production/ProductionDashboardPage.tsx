import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Factory,
  Package,
  Percent,
  TrendingUp,
} from "lucide-react";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { fetchProductionDashboard, type ProductionBatchSummaryRead, type ProductionDashboardRead } from "../../api/productionApi";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { AppEmptyState } from "../../components/app-shell";
import { PurchasingKpiCard, PurchasingKpiGrid, PurchasingTableSection } from "../../modules/purchasing/ui";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "./productionUi";
import { ProductThumb } from "./components/ProductThumb";

const DEFAULT_TENANT = 1;

function ReadyBatchRow({ batch }: { batch: ProductionBatchSummaryRead }) {
  const label = batch.product_labels?.slice(0, 2).join(", ") || `${batch.products_count} prod.`;
  return (
    <tr className="group transition-colors hover:bg-slate-50/80">
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
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
      <td className="px-6 py-3">
        <span className={batchStatusBadgeClass(batch.status)}>{BATCH_STATUS_LABEL[batch.status]}</span>
      </td>
      <td className="px-6 py-3 text-right tabular-nums text-slate-700">{batch.total_planned_units}</td>
      <td className="px-6 py-3 text-right">
        <Link
          to={erpProductionPaths.batch(batch.id)}
          className="text-xs font-semibold text-amber-700 opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
        >
          Szczegóły partii
        </Link>
      </td>
    </tr>
  );
}

function dashboardUnitsInProgress(data: ProductionDashboardRead): number {
  const rows = [...(data.in_progress ?? []), ...(data.active ?? [])];
  return rows.reduce((s, b) => s + (b.total_planned_units ?? 0), 0);
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
  const active = data?.in_progress ?? [];
  const unitsInProgress = data ? dashboardUnitsInProgress(data) : 0;
  const efficiency = data?.production_efficiency_percent ?? 0;

  return (
    <div className="space-y-6 pb-10">
      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie danych…</p>
      ) : data ? (
        <>
          <PurchasingKpiGrid columns={4}>
            <PurchasingKpiCard
              title="Zaplanowane partie"
              value={data.planned_batches}
              subtitle="Partie w harmonogramie"
              tone="indigo"
              icon={<ClipboardList aria-hidden />}
              to={erpProductionPaths.planning}
            />
            <PurchasingKpiCard
              title="W realizacji"
              value={data.active_batches}
              subtitle="Zbieranie, produkcja, odłożenie"
              tone="blue"
              icon={<Factory aria-hidden />}
              to={erpProductionPaths.orders}
            />
            <PurchasingKpiCard
              title="Braki materiałowe"
              value={data.batches_with_shortages}
              subtitle="Partie zablokowane stanem"
              tone="red"
              icon={<AlertTriangle aria-hidden />}
              to={`${erpProductionPaths.orders}?shortages=1`}
            />
            <PurchasingKpiCard
              title="Ukończone dziś"
              value={data.finished_today}
              subtitle="Partie zamknięte dziś"
              tone="emerald"
              icon={<CheckCircle2 aria-hidden />}
              to={erpProductionPaths.history}
            />
            <PurchasingKpiCard
              title="Produkcja w toku (szt.)"
              value={unitsInProgress}
              subtitle="Suma zaplanowanych sztuk w toku"
              tone="purple"
              icon={<Package aria-hidden />}
            />
            <PurchasingKpiCard
              title="Wartość produkcji w toku"
              value="—"
              subtitle="Wycena po kosztach receptur (wkrótce)"
              tone="amber"
              icon={<Banknote aria-hidden />}
            />
            <PurchasingKpiCard
              title="Średni koszt partii"
              value="—"
              subtitle="Na podstawie receptur aktywnych"
              tone="default"
              icon={<TrendingUp aria-hidden />}
              to={erpProductionPaths.analytics}
            />
            <PurchasingKpiCard
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
          </PurchasingKpiGrid>

          {blocked.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3 text-sm text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="font-medium">
                  {blocked.length} zleceń/partii zablokowanych brakami materiałów.
                </p>
              </div>
              <Link
                to={`${erpProductionPaths.orders}?shortages=1`}
                className="inline-flex shrink-0 items-center justify-center rounded-md bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Przejdź do braków
              </Link>
            </div>
          ) : null}

          <PurchasingTableSection
            title="Gotowe do wydania do WMS"
            subtitle={`${ready.length} partii gotowych`}
            indicatorClass="bg-emerald-500"
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
              />
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Partia</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Ilość</th>
                    <th className="px-6 py-3 text-right">Akcje</th>
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

          {active.length > 0 ? (
            <PurchasingTableSection
              title="W toku (monitoring)"
              subtitle={`${active.length} aktywnych partii`}
              indicatorClass="bg-sky-500"
            >
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {active.slice(0, 6).map((b) => (
                  <Link
                    key={b.id}
                    to={erpProductionPaths.batch(b.id)}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  >
                    <p className="font-mono text-sm font-semibold text-slate-900">{b.number}</p>
                    <p className="mt-1 text-xs text-slate-500">{b.product_labels?.slice(0, 2).join(", ") || "—"}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={batchStatusBadgeClass(b.status)}>{BATCH_STATUS_LABEL[b.status]}</span>
                      <span className="text-xs tabular-nums text-slate-500">{b.progress_percent ?? 0}%</span>
                    </div>
                  </Link>
                ))}
              </div>
            </PurchasingTableSection>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-rose-600">Nie udało się wczytać pulpitu produkcji.</p>
      )}
    </div>
  );
}
