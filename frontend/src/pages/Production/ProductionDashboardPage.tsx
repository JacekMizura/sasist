import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Factory,
  Layers,
  Plus,
  TrendingUp,
} from "lucide-react";
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
  suffix,
  icon: Icon,
  tone,
  sub,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  icon: typeof Factory;
  tone: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>
            {value}
            {suffix ? <span className="ml-0.5 text-lg font-semibold">{suffix}</span> : null}
          </p>
          {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
        </div>
        <Icon className={`h-9 w-9 shrink-0 ${tone} opacity-25`} aria-hidden />
      </div>
    </div>
  );
}

function BatchSection({
  title,
  subtitle,
  batches,
  empty,
  accent,
  showActions = true,
  onStartCollecting,
  onContinue,
}: {
  title: string;
  subtitle: string;
  batches: ProductionBatchSummaryRead[];
  empty: string;
  accent: string;
  showActions?: boolean;
  onStartCollecting?: (id: number) => void;
  onContinue?: (id: number, status: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`border-b border-slate-100 px-5 py-4 ${accent}`}>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      {batches.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
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
      )}
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
          Wybierz magazyn WMS, aby uruchomić centrum produkcji.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 pb-12 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Pulpit produkcji</h2>
          <p className="mt-1 text-sm text-slate-500">
            Planowanie masowe, kolejki partii i workflow zbieranie → wykonanie → odłożenie
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-md hover:bg-violet-700"
        >
          <Plus className="h-5 w-5" aria-hidden />
          Nowa partia masowa
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie pulpitu produkcji…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile
              label="Zaplanowane"
              value={data?.planned_batches ?? 0}
              icon={Calendar}
              tone="text-slate-800"
              sub="Partie oczekujące na start"
            />
            <StatTile
              label="Aktywne"
              value={data?.active_batches ?? 0}
              icon={Layers}
              tone="text-violet-600"
              sub={`${data?.collecting_batches ?? 0} zbier. · ${data?.in_production_batches ?? 0} prod. · ${data?.putaway_batches ?? 0} odkł.`}
            />
            <StatTile
              label="Braki materiałów"
              value={data?.batches_with_shortages ?? 0}
              icon={AlertTriangle}
              tone="text-amber-600"
            />
            <StatTile
              label="Dziś zakończone"
              value={data?.finished_today ?? 0}
              icon={CheckCircle2}
              tone="text-emerald-600"
            />
            <StatTile
              label="Efektywność"
              value={data?.production_efficiency_percent ?? 0}
              suffix="%"
              icon={TrendingUp}
              tone="text-blue-600"
              sub="Udział partii zakończonych dziś"
            />
          </div>

          <BatchSection
            title="Zaplanowane"
            subtitle="Wszystkie partie w statusie planowanym — w tym wieloproduktowe"
            batches={data?.planned ?? []}
            empty="Brak zaplanowanych partii. Utwórz partię masową z wieloma produktami."
            accent="bg-slate-50"
            onStartCollecting={handleStartCollecting}
          />

          <BatchSection
            title="Gotowe do produkcji"
            subtitle="Materiały dostępne — można rozpocząć zbieranie surowców"
            batches={data?.ready_to_produce ?? []}
            empty="Brak partii gotowych do startu."
            accent="bg-emerald-50/80"
            onStartCollecting={handleStartCollecting}
          />

          <BatchSection
            title="W trakcie realizacji"
            subtitle="Zbieranie, wykonanie lub odłożenie wyrobów"
            batches={data?.in_progress ?? data?.active ?? []}
            empty="Brak partii w toku."
            accent="bg-violet-50/80"
            onContinue={handleContinue}
          />

          <BatchSection
            title="Oczekuje na materiały"
            subtitle="Zaplanowane partie z brakami składników w magazynie"
            batches={data?.waiting_materials ?? []}
            empty="Brak partii z brakami materiałów."
            accent="bg-amber-50/80"
            showActions={false}
          />

          <BatchSection
            title="Zakończone dziś"
            subtitle="Partie ukończone w bieżącym dniu"
            batches={data?.recently_completed ?? []}
            empty="Dziś nie zakończono żadnej partii."
            accent="bg-emerald-50/50"
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
