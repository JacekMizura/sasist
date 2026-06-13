import { useCallback, useEffect, useMemo, useState } from "react";

import api from "../../api/axios";
import { AppEmptyState } from "../../components/app-shell/AppEmptyState";
import { useWarehouse } from "../../context/WarehouseContext";
import { CartsListPageHeader } from "../../modules/carts/CartsListPageHeader";
import { cartsPageShellClass } from "../../modules/carts/cartsModuleTokens";
import { Layers } from "lucide-react";
import ConsolidationRackGrid from "../wms/consolidation/ConsolidationRackGrid";
import ConsolidationRackSegmentPanel, {
  type SegmentPanelData,
  type SegmentSavePayload,
  type SegmentSaveResult,
} from "../wms/consolidation/ConsolidationRackSegmentPanel";
import { rackOccupancyStats, type RackGridLevel } from "../wms/consolidation/rackLayoutUtils";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import RackConfigurator from "./RackConfigurator";

type Rack = {
  id: number;
  name: string;
  levels: RackGridLevel[];
};

type ApiSegment = RackGridLevel["segments"][number];

function segmentToPanel(
  rackName: string,
  cell: {
    segmentId?: number;
    shelfLabel: string;
    slotLabel: string;
    slotLabelCustom?: string | null;
    columnName: string | null;
    rowNumber: number;
    orderId: number | null;
    orderNumber: string | null;
    fillPercent?: number;
    lengthMm?: number | null;
    widthMm?: number | null;
    heightMm?: number | null;
    capacityDm3?: number | null;
    orderVolumeDm3?: number | null;
    utilizationPercent?: number | null;
    capacityOverflow?: boolean;
    dimensionEstimated?: boolean;
    estimatedItemsCount?: number;
  },
  seg?: ApiSegment,
): SegmentPanelData {
  return {
    segmentId: cell.segmentId,
    rackName,
    shelfLabel: cell.shelfLabel,
    slotLabel: cell.slotLabel,
    effectiveSlotLabel: seg?.effective_slot_label ?? cell.slotLabel,
    columnName: cell.columnName,
    rowNumber: cell.rowNumber,
    statusLabel: cell.orderId != null ? "Zajęty" : "Wolny",
    orderId: cell.orderId,
    orderNumber: cell.orderNumber,
    fillPercent: cell.fillPercent,
    slotLabelCustom: seg?.slot_label ?? cell.slotLabelCustom ?? null,
    lengthMm: seg?.length_mm ?? cell.lengthMm,
    widthMm: seg?.width_mm ?? cell.widthMm,
    heightMm: seg?.height_mm ?? cell.heightMm,
    capacityDm3: seg?.capacity_dm3 ?? cell.capacityDm3,
    orderVolumeDm3: seg?.order_volume_dm3 ?? cell.orderVolumeDm3,
    utilizationPercent: seg?.utilization_percent ?? cell.utilizationPercent,
    capacityOverflow: seg?.capacity_overflow ?? cell.capacityOverflow,
    dimensionEstimated: seg?.dimension_estimated ?? cell.dimensionEstimated,
    estimatedItemsCount: seg?.estimated_items_count ?? cell.estimatedItemsCount,
    readOnly: false,
  };
}

function findSegmentInRacks(racks: Rack[], segmentId: number): { rack: Rack; seg: ApiSegment; level: RackGridLevel } | null {
  for (const rack of racks) {
    for (const level of rack.levels ?? []) {
      for (const seg of level.segments ?? []) {
        if (seg.id === segmentId) {
          return { rack, seg, level };
        }
      }
    }
  }
  return null;
}

export default function RacksTab() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? 1;
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<SegmentPanelData | null>(null);

  const fetchRacks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/racks/", {
        params: { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId },
      });
      setRacks(Array.isArray(res.data) ? res.data : []);
    } catch (err: unknown) {
      console.error("[RacksTab] Błąd pobierania regałów:", err);
      setError("Nie udało się załadować regałów.");
      setRacks([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void fetchRacks();
  }, [fetchRacks]);

  const handleSegmentSave = useCallback(
    async (segmentId: number, payload: SegmentSavePayload): Promise<SegmentSaveResult> => {
      const { data } = await api.patch<SegmentSaveResult>(`/racks/segments/${segmentId}/`, payload);
      const nextRacks = await api.get("/racks/", {
        params: { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId },
      });
      const list: Rack[] = Array.isArray(nextRacks.data) ? nextRacks.data : [];
      setRacks(list);
      return data;
    },
    [warehouseId],
  );

  const rackStats = useMemo(
    () => racks.map((rack) => ({ rack, stats: rackOccupancyStats(rack.levels ?? []) })),
    [racks],
  );

  if (loading) {
    return <div className="py-10 text-center text-[13px] text-slate-500">Ładowanie regałów…</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-4 text-[13px] font-medium text-red-700">{error}</div>
    );
  }

  return (
    <div className={cartsPageShellClass}>
      <CartsListPageHeader
        title="Regały kompletacyjne"
        description={
          warehouse?.name
            ? `Magazyn: ${warehouse.name}. Kliknij półkę (A1, B2…), aby ustawić nazwę i wymiary.`
            : "Kliknij półkę (A1, B2…), aby ustawić nazwę i wymiary."
        }
      />
      <RackConfigurator onRackAdded={fetchRacks} />

      {racks.length === 0 ? (
        <AppEmptyState icon={Layers} title="Brak regałów" description="Utwórz regał w kreatorze powyżej." />
      ) : (
        <div className="space-y-5">
          {rackStats.map(({ rack, stats }) => (
            <section key={rack.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-100 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-mono text-xl font-bold text-slate-900">{rack.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">Kliknij segment, aby skonfigurować nazwę i pojemność</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Segmentów</dt>
                      <dd className="font-bold tabular-nums">{stats.total}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-emerald-600">Wolnych</dt>
                      <dd className="font-bold tabular-nums text-emerald-800">{stats.free}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-orange-600">Zajętych</dt>
                      <dd className="font-bold tabular-nums text-orange-800">{stats.occupied}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-violet-600">Wykorzystanie</dt>
                      <dd className="font-bold tabular-nums text-violet-900">{stats.utilizationPercent}%</dd>
                    </div>
                  </dl>
                </div>
              </header>
              <div className="p-4">
                <ConsolidationRackGrid
                  rackName={rack.name}
                  levels={rack.levels ?? []}
                  onSegmentClick={(cell) => {
                    const hit = cell.segmentId != null ? findSegmentInRacks(racks, cell.segmentId) : null;
                    setPanel(segmentToPanel(rack.name, cell, hit?.seg));
                  }}
                />
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded border border-emerald-400 bg-emerald-50" /> Wolny
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded border border-orange-400 bg-orange-50" /> Zajęty
                  </span>
                  <span className="text-slate-500">· Kliknij półkę, aby edytować nazwę (TV-01) i wymiary</span>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      <ConsolidationRackSegmentPanel segment={panel} onClose={() => setPanel(null)} onSave={handleSegmentSave} />
    </div>
  );
}
