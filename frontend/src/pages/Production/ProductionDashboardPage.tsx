import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Plus } from "lucide-react";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { fetchProductionDashboard, type ProductionDashboardRead } from "../../api/productionApi";
import { BatchCard } from "./components/BatchCard";
import { ErpKpiCard } from "./components/ErpKpiCard";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";

const DEFAULT_TENANT = 1;

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
    return (
      <div className="px-4 py-8">
        <ActiveWarehouseRequiredBanner hint="Zlecenia RW/PW i partie produkcyjne są tworzone w aktywnym magazynie." />
      </div>
    );
  }

  const ready = data?.ready_to_produce ?? [];
  const blocked = data?.waiting_materials ?? [];
  const active = data?.in_progress ?? [];

  return (
    <div className="space-y-6 px-4 pb-10 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Pulpit operacyjny</h2>
          <p className="text-sm text-slate-500">Stan planowania i kolejek — bez interfejsu terminalowego.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={erpProductionPaths.orders}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Zlecenia produkcyjne
          </Link>
          <Link
            to={erpProductionPaths.planning}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Planowanie
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie danych…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <ErpKpiCard label="Zaplanowane" value={data?.planned_batches ?? 0} />
            <ErpKpiCard label="W realizacji" value={data?.active_batches ?? 0} tone="info" />
            <ErpKpiCard label="Braki materiałów" value={data?.batches_with_shortages ?? 0} tone="warning" />
            <ErpKpiCard label="Dziś ukończone" value={data?.finished_today ?? 0} tone="success" />
            <ErpKpiCard
              label="Efektywność"
              value={`${data?.production_efficiency_percent ?? 0}%`}
              hint="Udział partii zakończonych dziś"
            />
          </div>

          {blocked.length > 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="font-medium">{blocked.length} zleceń/partii zablokowanych brakami materiałów.</p>
                <Link to={erpProductionPaths.orders} className="mt-1 inline-block text-xs font-semibold underline">
                  Przejdź do zleceń
                </Link>
              </div>
            </div>
          ) : null}

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Gotowe do wydania do WMS</h3>
              <Link to={wmsProductionPaths.collecting()} className="text-xs font-medium text-slate-500 hover:text-slate-800">
                Terminal WMS → Zbieranie
              </Link>
            </div>
            {ready.length === 0 ? (
              <p className="px-4 py-8 text-sm text-slate-500">Brak partii gotowych do przekazania operatorom.</p>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {ready.slice(0, 6).map((b) => (
                  <BatchCard key={b.id} batch={b} showActions={false} />
                ))}
              </div>
            )}
          </section>

          {active.length > 0 ? (
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">W toku (monitoring)</h3>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {active.slice(0, 6).map((b) => (
                  <BatchCard key={b.id} batch={b} showActions={false} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
