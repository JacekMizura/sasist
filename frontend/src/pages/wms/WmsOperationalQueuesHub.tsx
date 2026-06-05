import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWarehouseExecution } from "../../context/WarehouseExecutionContext";
import {
  listWmsOperationalTasks,
  OPERATIONAL_QUEUES,
  resolveWmsOperationalTaskScan,
  type OperationalQueueId,
} from "../../api/wmsOperationalTasksApi";
import { OperationalTaskCard, operationalTaskRoute } from "../../components/wms/operational/OperationalTaskCard";
import { ScanStepHero } from "../../components/wms/execution/ScanStepHero";
import { ScanExecutionShell } from "../../components/wms/execution/ScanExecutionShell";
import { useWmsPageScanHandler } from "../../components/wms/execution/useWmsPageScanHandler";
import { useWmsScanResolveNavigate } from "../../components/wms/execution/useWmsScanResolveNavigate";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { useWmsShortagesRefresh } from "../../hooks/useWmsShortagesRefresh";
import { WMS_ROUTES } from "./wmsRoutes";

/**
 * @deprecated Operator flow uses Braki (`/wms/braki`). Route redirects — component retained for reference only.
 */
export default function WmsOperationalQueuesHub() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const navigate = useNavigate();
  const { isCoarsePointer } = useWarehouseExecution();

  const [activeQueue, setActiveQueue] = useState<OperationalQueueId>("DO_DOGRYWKI");
  const [items, setItems] = useState<Awaited<ReturnType<typeof listWmsOperationalTasks>>["items"]>([]);
  const [summaries, setSummaries] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const activeMeta = OPERATIONAL_QUEUES.find((q) => q.id === activeQueue);

  const load = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await listWmsOperationalTasks(DAMAGE_TENANT_ID, warehouseId, {
        queue: activeQueue,
        sync: true,
      });
      setItems(res.items ?? []);
      const m: Record<string, number> = {};
      for (const s of res.queue_summaries ?? []) {
        m[s.queue] = s.count;
      }
      setSummaries(m);
    } catch {
      setItems([]);
      setErr("Nie udało się wczytać kolejki operacyjnej.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId, activeQueue]);

  useEffect(() => {
    void load();
  }, [load]);

  useWmsShortagesRefresh(() => void load(), { debounceMs: 800 });

  const { onScan, bindPlaceholder } = useWmsScanResolveNavigate({
    enabled: warehouseId != null,
    placeholder: "Skanuj produkt, zamówienie lub nośnik",
    notFoundMessage: "Brak aktywnego zadania operacyjnego dla skanu.",
    resolve: (scan) => resolveWmsOperationalTaskScan(DAMAGE_TENANT_ID, warehouseId!, scan),
    onResolved: (task) => {
      navigate(operationalTaskRoute(task));
    },
  });

  useEffect(() => bindPlaceholder(), [bindPlaceholder]);
  useWmsPageScanHandler(onScan, warehouseId != null);

  const totalActive = useMemo(
    () => Object.values(summaries).reduce((a, b) => a + b, 0),
    [summaries],
  );

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-center text-slate-600">
        Wybierz magazyn w nagłówku.
      </div>
    );
  }

  return (
    <ScanExecutionShell
      title="Kolejki wykonawcze"
      backTo={WMS_ROUTES.menu}
      backLabel="Menu WMS"
      headerRight={
        !isCoarsePointer ? (
          <Link
            to={WMS_ROUTES.operationalDashboard}
            className="rounded-lg bg-white/15 px-2 py-1 text-[10px] font-black uppercase"
          >
            Pulpit
          </Link>
        ) : null
      }
    >
      <ScanStepHero
        title="Zeskanuj następne zadanie"
        scanHint="EAN produktu · numer zamówienia · kod nośnika"
        sourceLabel={activeMeta?.routeHint}
        targetLabel={`${items.length} na trasie`}
      />

      {isCoarsePointer ? (
        <Link
          to={WMS_ROUTES.operationalDashboard}
          className="mb-3 flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-800"
        >
          <LayoutDashboard size={18} />
          Pulpit operacyjny (monitoring)
        </Link>
      ) : null}

      <div className="mb-2 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2">
          {OPERATIONAL_QUEUES.map((q) => {
            const count = summaries[q.id] ?? 0;
            const active = activeQueue === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setActiveQueue(q.id)}
                className={`max-w-[200px] shrink-0 rounded-2xl px-4 py-3 text-left transition ${
                  active
                    ? "bg-indigo-600 text-white shadow-md"
                    : "border border-slate-200 bg-white text-slate-800"
                }`}
              >
                <p className="text-xs font-black uppercase">{q.label}</p>
                <p className={`mt-0.5 text-[10px] ${active ? "text-indigo-200" : "text-slate-500"}`}>
                  {q.routeHint}
                </p>
                <p className="mt-1 text-lg font-black">{count}</p>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-600">
        {totalActive > 0 ? `${totalActive} aktywnych na wszystkich trasach` : "Brak aktywnych operacji"}
      </p>

      {err ? <p className="mb-4 text-sm font-medium text-red-800">{err}</p> : null}

      {loading ? (
        <p className="py-12 text-center text-slate-500">Ładowanie trasy…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
          <p className="font-semibold text-slate-800">Brak operacji na tej trasie</p>
          <p className="mt-1 text-sm text-slate-600">Zeskanuj produkt lub przejdź do innej kolejki.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((t) => (
            <li key={t.id}>
              <OperationalTaskCard task={t} />
            </li>
          ))}
        </ul>
      )}
    </ScanExecutionShell>
  );
}
