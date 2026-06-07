import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Factory, Layers, Plus, ScanLine } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  createProductionBatch,
  fetchProductionDashboard,
  startCollectingBatch,
  type ProductionBatchSummaryRead,
  type ProductionDashboardRead,
} from "../../api/productionApi";
import { BatchCard } from "./components/BatchCard";
import { CreateBatchModal } from "./components/CreateBatchModal";
import { productionPaths } from "./productionPaths";

const DEFAULT_TENANT = 1;

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Factory;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
        </div>
        <Icon className={`h-9 w-9 ${tone} opacity-30`} aria-hidden />
      </div>
    </div>
  );
}

function BatchSection({
  title,
  subtitle,
  batches,
  empty,
  showActions = true,
  onStartCollecting,
  onContinue,
}: {
  title: string;
  subtitle: string;
  batches: ProductionBatchSummaryRead[];
  empty: string;
  showActions?: boolean;
  onStartCollecting?: (id: number) => void;
  onContinue?: (id: number, status: string) => void;
}) {
  if (batches.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{empty}</p>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {batches.map((b) => (
          <BatchCard
            key={b.id}
            batch={b}
            showActions={showActions}
            onStartCollecting={onStartCollecting}
            onContinue={onContinue}
          />
        ))}
      </div>
    </section>
  );
}

export default function ProductionDashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [data, setData] = useState<ProductionDashboardRead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
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

  useEffect(() => {
    const create = searchParams.get("create");
    const productId = searchParams.get("product");
    const compositionId = searchParams.get("composition");
    if (create !== "1" || !productId || !compositionId || warehouseId == null) return;
    void (async () => {
      try {
        const batch = await createProductionBatch(tenantId, {
          warehouse_id: warehouseId,
          status: "planned",
          lines: [
            {
              product_id: Number(productId),
              composition_id: Number(compositionId),
              planned_quantity: 1,
            },
          ],
        });
        setSearchParams({});
        navigate(productionPaths.batch(batch.id));
      } catch {
        setModalOpen(true);
        setSearchParams({});
      }
    })();
  }, [searchParams, warehouseId, tenantId, navigate, setSearchParams]);

  const handleStartCollecting = async (id: number) => {
    await startCollectingBatch(tenantId, id);
    navigate(productionPaths.collecting(id));
  };

  const handleContinue = (id: number, status: string) => {
    if (status === "collecting") navigate(productionPaths.collecting(id));
    else if (status === "in_progress") navigate(productionPaths.execute(id));
    else if (status === "putaway") navigate(productionPaths.putaway(id));
    else navigate(productionPaths.batch(id));
  };

  const handleCreated = (batchId: number) => {
    void reload();
    navigate(productionPaths.batch(batchId));
  };

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-medium text-amber-900">
          Wybierz magazyn WMS, aby uruchomić produkcję.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 pb-12 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Produkcja</h1>
          <p className="mt-1 text-sm text-slate-500">Wykonanie magazynowe — batch → zbieranie → produkcja → odkładanie</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
        >
          <Plus className="h-5 w-5" aria-hidden />
          Nowy batch
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie pulpitu…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Aktywne partie" value={data?.active_batches ?? 0} icon={Layers} tone="text-violet-600" />
            <StatTile label="Oczekujące" value={data?.waiting_batches ?? 0} icon={Clock} tone="text-slate-700" />
            <StatTile label="Braki materiałów" value={data?.batches_with_shortages ?? 0} icon={AlertTriangle} tone="text-amber-600" />
            <StatTile label="Dziś zakończone" value={data?.finished_today ?? 0} icon={CheckCircle2} tone="text-emerald-600" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => navigate(productionPaths.collecting())}
              className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left hover:bg-amber-100/80"
            >
              <ScanLine className="h-8 w-8 text-amber-700" aria-hidden />
              <div>
                <p className="font-semibold text-amber-900">Zbieranie</p>
                <p className="text-xs text-amber-800">{data?.collecting_batches ?? 0} w toku</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => navigate(productionPaths.execute())}
              className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left hover:bg-blue-100/80"
            >
              <Factory className="h-8 w-8 text-blue-700" aria-hidden />
              <div>
                <p className="font-semibold text-blue-900">Produkcja</p>
                <p className="text-xs text-blue-800">{data?.in_production_batches ?? 0} w toku</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => navigate(productionPaths.putaway())}
              className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left hover:bg-emerald-100/80"
            >
              <CheckCircle2 className="h-8 w-8 text-emerald-700" aria-hidden />
              <div>
                <p className="font-semibold text-emerald-900">Odłożenie</p>
                <p className="text-xs text-emerald-800">{data?.putaway_batches ?? 0} w toku</p>
              </div>
            </button>
          </div>

          <BatchSection
            title="Aktywne partie"
            subtitle="Zbieranie, produkcja lub odkładanie w toku"
            batches={data?.active ?? []}
            empty="Brak aktywnych partii."
            onContinue={handleContinue}
          />

          <BatchSection
            title="Czeka na materiały"
            subtitle="Zaplanowane — braki składników w magazynie"
            batches={data?.waiting_materials ?? []}
            empty="Brak partii z brakami."
            onStartCollecting={handleStartCollecting}
          />

          <BatchSection
            title="Gotowe do produkcji"
            subtitle="Materiały dostępne — można rozpocząć zbieranie"
            batches={data?.ready_to_produce ?? []}
            empty="Brak partii gotowych do startu."
            onStartCollecting={handleStartCollecting}
          />

          <BatchSection
            title="Ostatnio zakończone"
            subtitle="Dzisiejsze partie"
            batches={data?.recently_completed ?? []}
            empty="Dziś nie zakończono żadnej partii."
            showActions={false}
          />
        </>
      )}

      <CreateBatchModal
        open={modalOpen}
        tenantId={tenantId}
        warehouseId={warehouseId}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
