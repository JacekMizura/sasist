import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";

import {
  fetchConsolidationRacksDashboard,
  type ConsolidationRackDashboard,
  type ConsolidationRackSegmentDashboard,
} from "../../../api/wmsConsolidationApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import ConsolidationRackGrid from "../../../modules/consolidation-racks/ConsolidationRackGrid";
import ConsolidationRackSegmentModal from "../../../modules/consolidation-racks/ConsolidationRackSegmentModal";
import type { SegmentModalData } from "../../../modules/consolidation-racks/consolidationRackTypes";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { WMS_ROUTES } from "../wmsRoutes";
import { rackSegmentStateLabel } from "./consolidationRackDashboardUi";
import {
  ConsolidationOperatorPage,
  ConsolidationRackLegend,
  WMS_CONSOLIDATION_LABELS,
} from "./consolidationOperatorUi";

export default function ConsolidationRacksDashboardPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [data, setData] = useState<ConsolidationRackDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<SegmentModalData | null>(null);

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
    <ConsolidationOperatorPage
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={WMS_ROUTES.consolidations}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {WMS_CONSOLIDATION_LABELS.backToTodo}
            </Link>
            <span className="text-sm font-semibold text-slate-800">{WMS_CONSOLIDATION_LABELS.shelfPreview}</span>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Odśwież
          </button>
        </div>
      }
    >
      <ConsolidationRackLegend />

      {loading && !data ? (
        <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Wczytywanie…
        </div>
      ) : data?.racks.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">Brak skonfigurowanych regałów w tym magazynie.</p>
      ) : data ? (
        <div className="mt-4 space-y-8">
          {data.racks.map((rack) => {
            const fixedLevels = rack.levels.map((lv) => ({
              id: lv.level_id,
              level_index: lv.level_index,
              name: lv.level_name,
              is_segmented: lv.is_segmented,
              segments: lv.segments.map((s, idx) => ({
                id: s.segment_id,
                segment_index: idx,
                slot_label: s.slot_label,
                effective_slot_label: s.slot_label,
                order_id: s.order_id,
                order_number: s.order_number,
                fill_percent: s.fill_percent,
                length_mm: s.length_mm,
                width_mm: s.width_mm,
                height_mm: s.height_mm,
                capacity_dm3: s.capacity_dm3,
                order_volume_dm3: s.order_volume_dm3,
                utilization_percent: s.utilization_percent,
                capacity_overflow: s.capacity_overflow,
                dimension_estimated: s.dimension_estimated,
                estimated_items_count: s.estimated_items_count,
              })),
            }));

            return (
              <section key={rack.rack_id}>
                <h2 className="mb-3 font-mono text-base font-bold text-slate-900">{rack.rack_name}</h2>
                <ConsolidationRackGrid
                  rackName={rack.rack_name}
                  levels={fixedLevels}
                  dashboardBySegmentId={dashboardBySegmentId}
                  onSegmentClick={(cell) => {
                    const dash = cell.segmentId != null ? dashboardBySegmentId.get(cell.segmentId) : undefined;
                    setModal({
                      segmentId: cell.segmentId,
                      rackName: rack.rack_name,
                      shelfLabel: dash?.shelf_label ?? cell.shelfLabel,
                      slotLabel: dash?.slot_label ?? cell.slotLabel,
                      columnName: cell.columnName,
                      rowNumber: cell.rowNumber,
                      statusLabel: dash ? rackSegmentStateLabel(dash.state) : cell.orderId ? "Zajęty" : "Wolny",
                      orderId: cell.orderId,
                      orderNumber: cell.orderNumber,
                      fillPercent: cell.fillPercent,
                      readOnly: true,
                    });
                  }}
                />
              </section>
            );
          })}
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-slate-500">Nie udało się wczytać mapy półek.</p>
      )}

      <ConsolidationRackSegmentModal segment={modal} onClose={() => setModal(null)} />
    </ConsolidationOperatorPage>
  );
}
