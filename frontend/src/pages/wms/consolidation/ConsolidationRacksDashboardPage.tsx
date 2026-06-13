import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LayoutGrid, Loader2, RefreshCw } from "lucide-react";

import {
  fetchConsolidationRacksDashboard,
  type ConsolidationRackDashboard,
  type ConsolidationRackSegmentDashboard,
} from "../../../api/wmsConsolidationApi";
import { consolidationPlanStatusLabel } from "../../../api/orderConsolidationApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { WMS_ROUTES } from "../wmsRoutes";
import {
  rackSegmentHeadline,
  rackSegmentStateClass,
  rackSegmentStateLabel,
} from "./consolidationRackDashboardUi";

function SummaryTile({
  label,
  value,
  tone,
  suffix,
}: {
  label: string;
  value: number | string;
  tone: string;
  suffix?: string;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <div className="text-2xl font-bold tabular-nums">
        {value}
        {suffix ? <span className="text-lg font-semibold">{suffix}</span> : null}
      </div>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}

function SegmentCard({ seg }: { seg: ConsolidationRackSegmentDashboard }) {
  const occupied = seg.state !== "FREE";
  return (
    <article
      className={`rounded-xl border p-4 shadow-sm transition ${rackSegmentStateClass(seg.state)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-lg font-bold">{seg.slot_label}</div>
          <div className="mt-1 text-sm font-semibold">{rackSegmentHeadline(seg)}</div>
        </div>
        <span className="shrink-0 rounded-full border border-current/20 bg-white/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
          {rackSegmentStateLabel(seg.state)}
        </span>
      </div>

      {occupied ? (
        <dl className="mt-4 space-y-1.5 text-xs">
          {seg.customer_name ? (
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Klient</dt>
              <dd className="font-medium text-right">{seg.customer_name}</dd>
            </div>
          ) : null}
          {seg.plan_status ? (
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Plan</dt>
              <dd className="font-medium">{consolidationPlanStatusLabel(seg.plan_status)}</dd>
            </div>
          ) : null}
          {seg.order_status ? (
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Status zam.</dt>
              <dd className="font-medium">{seg.order_status}</dd>
            </div>
          ) : null}
          {seg.mm_staging_label && seg.mm_staging_label !== "—" ? (
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">MM</dt>
              <dd className="font-mono font-semibold tabular-nums">{seg.mm_staging_label}</dd>
            </div>
          ) : null}
          {seg.local_staging_label && seg.local_staging_label !== "—" ? (
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Lokalne</dt>
              <dd className="font-mono font-semibold tabular-nums">{seg.local_staging_label}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Ukończenie</dt>
            <dd className="font-mono font-semibold tabular-nums">{seg.completion_percent.toFixed(0)}%</dd>
          </div>
          {seg.packing_ready ? (
            <div className="mt-2 rounded-lg bg-white/70 px-2 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-orange-800">
              READY_TO_PACK
            </div>
          ) : null}
          {seg.plan_id ? (
            <Link
              to={WMS_ROUTES.consolidationDetail(seg.plan_id)}
              className="mt-3 inline-flex text-xs font-semibold underline underline-offset-2"
            >
              Szczegóły planu
            </Link>
          ) : null}
        </dl>
      ) : null}
    </article>
  );
}

export default function ConsolidationRacksDashboardPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [data, setData] = useState<ConsolidationRackDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (warehouseId == null || warehouseId <= 0) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = await fetchConsolidationRacksDashboard(DAMAGE_TENANT_ID, warehouseId);
      setData(payload);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={WMS_ROUTES.consolidations}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Konsolidacje
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Odśwież
        </button>
      </div>

      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-violet-600" aria-hidden />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Regały kompletacyjne</h1>
            <p className="text-sm text-slate-500">Zajętość półek w magazynie docelowym konsolidacji</p>
          </div>
        </div>
      </header>

      {loading && !data ? (
        <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Wczytywanie mapy regałów…
        </div>
      ) : data ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryTile label="Wolne półki" value={data.summary.free_count} tone="border-emerald-200 bg-emerald-50/80" />
            <SummaryTile label="Zajęte" value={data.summary.occupied_count} tone="border-slate-200 bg-slate-50" />
            <SummaryTile
              label="Pozostało"
              value={data.summary.remaining_percent ?? 0}
              suffix="%"
              tone="border-violet-200 bg-violet-50/80"
            />
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <SummaryTile
              label="Ready to pack"
              value={data.summary.ready_to_pack_count}
              tone="border-orange-200 bg-orange-50/80"
            />
            <SummaryTile label="Wyjątki" value={data.summary.exception_count} tone="border-red-200 bg-red-50/80" />
          </section>

          {data.racks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
              Brak skonfigurowanych regałów kompletacyjnych w tym magazynie.
            </div>
          ) : (
            data.racks.map((rack) => (
              <section key={rack.rack_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-mono text-lg font-bold text-slate-900">{rack.rack_name}</h2>
                <div className="mt-4 space-y-6">
                  {rack.levels.map((level) => (
                    <div key={level.level_id}>
                      {level.is_segmented ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {level.segments.map((seg) => (
                            <SegmentCard key={seg.segment_id} seg={seg} />
                          ))}
                        </div>
                      ) : (
                        <div className="grid gap-3">
                          {level.segments.map((seg) => (
                            <SegmentCard key={seg.segment_id} seg={seg} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Nie udało się wczytać mapy regałów.
        </div>
      )}
    </div>
  );
}
