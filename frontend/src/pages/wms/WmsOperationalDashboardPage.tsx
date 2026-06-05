import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Package, Timer, Truck } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  listWmsOperationalTasks,
  OPERATIONAL_QUEUES,
  type WmsOperationalTaskApi,
} from "../../api/wmsOperationalTasksApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WMS_ROUTES } from "./wmsRoutes";
import { queueRouteLabel } from "../../components/wms/operational/operationalWorkflow";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

export default function WmsOperationalDashboardPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [items, setItems] = useState<WmsOperationalTaskApi[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    try {
      const res = await listWmsOperationalTasks(DAMAGE_TENANT_ID, warehouseId, {
        limit: 400,
        sync: true,
      });
      setItems(res.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const byQueue: Record<string, number> = {};
    let relocActive = 0;
    let waitingQty = 0;
    let waitingOld = 0;
    let inProgress = 0;
    const now = Date.now();
    for (const t of items) {
      byQueue[t.queue] = (byQueue[t.queue] ?? 0) + 1;
      if (t.task_type === "RELOCATION" && t.status !== "done") relocActive += 1;
      if (t.task_type === "WAITING_SUPPLY") {
        waitingQty += t.quantity_remaining || 0;
        const ref = t.waiting_oldest_at ?? t.created_at;
        if (ref) {
          const days = (now - new Date(ref).getTime()) / 86400000;
          if (days >= 1) waitingOld += 1;
        }
      }
      if (t.status === "in_progress") inProgress += 1;
    }
    return { byQueue, relocActive, waitingQty, waitingOld, inProgress, total: items.length };
  }, [items]);

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-600">
        Wybierz magazyn w nagłówku.
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0f172a] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-indigo-300">
              Widok kierownika
            </p>
            <h1 className="text-2xl font-black">Pulpit operacyjny (KPI)</h1>
            <p className="mt-1 text-sm text-slate-400">
              Monitoring kolejek — nie jest częścią flow operatora (Braki → wykonanie).
            </p>
          </div>
          <Link
            to="/analytics/warehouse-operations"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold hover:bg-indigo-500"
          >
            Centrum operacyjne <ArrowRight size={16} />
          </Link>
        </div>

        {loading ? (
          <p className="text-slate-400">Ładowanie…</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-700 bg-slate-800/80 p-4">
                <Package className="text-indigo-400" size={22} />
                <p className="mt-2 text-2xl font-black">{stats.total}</p>
                <p className="text-xs text-slate-400">Aktywne operacje</p>
              </div>
              <div className="rounded-2xl border border-violet-700/50 bg-violet-950/50 p-4">
                <Truck className="text-violet-300" size={22} />
                <p className="mt-2 text-2xl font-black">{stats.relocActive}</p>
                <p className="text-xs text-violet-200">Relocation w toku</p>
              </div>
              <div className="rounded-2xl border border-amber-700/50 bg-amber-950/40 p-4">
                <Timer className="text-amber-300" size={22} />
                <p className="mt-2 text-2xl font-black">{fmtQty(stats.waitingQty)}</p>
                <p className="text-xs text-amber-100">Szt. na dostawę</p>
              </div>
              <div className="rounded-2xl border border-emerald-700/50 bg-emerald-950/40 p-4">
                <Activity className="text-emerald-300" size={22} />
                <p className="mt-2 text-2xl font-black">{stats.inProgress}</p>
                <p className="text-xs text-emerald-100">Sesje in_progress</p>
              </div>
            </div>

            <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">
                Heatmapa kolejek
              </h2>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {OPERATIONAL_QUEUES.map((q) => {
                  const n = stats.byQueue[q.id] ?? 0;
                  const intensity =
                    n === 0 ? "bg-slate-700" : n < 3 ? "bg-indigo-900" : n < 8 ? "bg-indigo-700" : "bg-indigo-500";
                  return (
                    <div
                      key={q.id}
                      className={`flex items-center justify-between rounded-xl px-4 py-3 ${intensity}`}
                    >
                      <div>
                        <p className="text-sm font-bold">{q.label}</p>
                        <p className="text-[10px] opacity-80">{queueRouteLabel(q.id)}</p>
                      </div>
                      <span className="text-xl font-black">{n}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {stats.waitingOld > 0 ? (
              <p className="mt-4 rounded-xl border border-orange-500/40 bg-orange-950/30 px-4 py-3 text-sm text-orange-100">
                {stats.waitingOld} produktów czeka na dostawę dłużej niż 1 dzień — priorytet inbound.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
