import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LayoutGrid, Loader2, RefreshCw, Settings, TowerControl } from "lucide-react";

import {
  fetchConsolidationRacksDashboard,
  type ConsolidationRackDashboard,
  type ConsolidationRackSegmentDashboard,
} from "../../../api/wmsConsolidationApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { WMS_ROUTES } from "../wmsRoutes";
import ConsolidationRackGrid from "./ConsolidationRackGrid";
import ConsolidationRackSegmentPanel, { type SegmentPanelData } from "./ConsolidationRackSegmentPanel";
import { rackOccupancyStats } from "./rackLayoutUtils";
import { rackSegmentStateLabel } from "./consolidationRackDashboardUi";

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

export default function ConsolidationRacksDashboardPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [data, setData] = useState<ConsolidationRackDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<SegmentPanelData | null>(null);

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

  const dashboardBySegmentId = useMemo(() => {
    const map = new Map<number, ConsolidationRackSegmentDashboard>();
    if (!data) return map;
    for (const rack of data.racks) {
      for (const level of rack.levels) {
        for (const seg of level.segments) {
          map.set(seg.segment_id, seg);
        }
      }
    }
    return map;
  }, [data]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={WMS_ROUTES.consolidations}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Konsolidacje
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/carts/racks"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden />
            Konfiguracja
          </Link>
          <Link
            to={WMS_ROUTES.consolidationRacksControlTower}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100"
          >
            <TowerControl className="h-3.5 w-3.5" aria-hidden />
            Control Tower
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
      </div>

      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-violet-600" aria-hidden />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Regały kompletacyjne</h1>
            <p className="text-sm text-slate-500">Podgląd zajętości — siatka półek jak na hali</p>
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

          <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-50" /> Wolny
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-sky-300 bg-sky-50" /> Rozkładanie
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-orange-300 bg-orange-50" /> Gotowe do pakowania
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-red-300 bg-red-50" /> Wyjątek
            </span>
          </div>

          {data.racks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
              Brak skonfigurowanych regałów.{" "}
              <Link to="/carts/racks" className="font-semibold text-violet-700 underline">
                Dodaj regał
              </Link>
            </div>
          ) : (
            data.racks.map((rack) => {
              const fixedLevels = rack.levels.map((lv) => ({
                id: lv.level_id,
                level_index: lv.level_index,
                name: lv.level_name,
                is_segmented: lv.is_segmented,
                segments: lv.segments.map((s) => {
                  const rowMatch = s.slot_label.match(/(\d+)$/);
                  const segmentIndex = rowMatch ? Math.max(0, parseInt(rowMatch[1], 10) - 1) : 0;
                  return {
                    id: s.segment_id,
                    segment_index: segmentIndex,
                    order_id: s.order_id,
                    order_number: s.order_number,
                    fill_percent: s.fill_percent,
                  };
                }),
              }));
              const stats = rackOccupancyStats(fixedLevels);

              return (
                <section key={rack.rack_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                    <h2 className="font-mono text-lg font-bold text-slate-900">{rack.rack_name}</h2>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-[10px] font-bold uppercase text-slate-400">Segmentów</dt>
                        <dd className="font-bold tabular-nums">{stats.total}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase text-emerald-600">Wolnych</dt>
                        <dd className="font-bold tabular-nums">{stats.free}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase text-orange-600">Zajętych</dt>
                        <dd className="font-bold tabular-nums">{stats.occupied}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase text-violet-600">Wykorzystanie</dt>
                        <dd className="font-bold tabular-nums">{stats.utilizationPercent}%</dd>
                      </div>
                    </dl>
                  </header>
                  <ConsolidationRackGrid
                    rackName={rack.rack_name}
                    levels={fixedLevels}
                    dashboardBySegmentId={dashboardBySegmentId}
                    onSegmentClick={(cell) => {
                      const dash = cell.segmentId != null ? dashboardBySegmentId.get(cell.segmentId) : undefined;
                      setPanel({
                        shelfLabel: dash?.shelf_label ?? cell.shelfLabel,
                        slotLabel: dash?.slot_label ?? cell.slotLabel,
                        columnName: cell.columnName,
                        rowNumber: cell.rowNumber,
                        statusLabel: dash ? rackSegmentStateLabel(dash.state) : cell.orderId ? "Zajęty" : "Wolny",
                        orderId: cell.orderId,
                        orderNumber: cell.orderNumber,
                        fillPercent: cell.fillPercent,
                      });
                    }}
                  />
                </section>
              );
            })
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Nie udało się wczytać mapy regałów.
        </div>
      )}

      <ConsolidationRackSegmentPanel segment={panel} onClose={() => setPanel(null)} />
    </div>
  );
}
