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
} from "../wms/consolidation/ConsolidationRackSegmentPanel";
import { rackOccupancyStats, type RackGridLevel } from "../wms/consolidation/rackLayoutUtils";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import RackConfigurator from "./RackConfigurator";

type Rack = {
  id: number;
  name: string;
  levels: RackGridLevel[];
};

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
        description={warehouse?.name ? `Magazyn: ${warehouse.name}` : undefined}
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
                    <p className="mt-1 text-sm text-slate-500">Układ fizyczny regału</p>
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
                  onSegmentClick={(cell) =>
                    setPanel({
                      shelfLabel: cell.shelfLabel,
                      slotLabel: cell.slotLabel,
                      columnName: cell.columnName,
                      rowNumber: cell.rowNumber,
                      statusLabel: cell.orderId != null ? "Zajęty" : "Wolny",
                      orderId: cell.orderId,
                      orderNumber: cell.orderNumber,
                      fillPercent: cell.fillPercent,
                    })
                  }
                />
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded border border-emerald-400 bg-emerald-50" /> Wolny
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded border border-orange-400 bg-orange-50" /> Zajęty
                  </span>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      <ConsolidationRackSegmentPanel segment={panel} onClose={() => setPanel(null)} />
    </div>
  );
}
