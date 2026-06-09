import { useEffect, useState } from "react";

import api from "../../api/axios";
import { AppEmptyState } from "../../components/app-shell/AppEmptyState";
import { CartsListPageHeader } from "../../modules/carts/CartsListPageHeader";
import {
  cartsEmptyClass,
  cartsGroupShellClass,
  cartsPageShellClass,
  cartsSectionTitleClass,
} from "../../modules/carts/cartsModuleTokens";
import { Layers } from "lucide-react";
import ProgressBar from "./ui/ProgressBar";
import RackConfigurator from "./RackConfigurator";

const TENANT_ID = 1;
const WAREHOUSE_ID = 1;

type Segment = {
  id: number;
  level_id: number;
  segment_index: number;
  order_id: number | null;
  order_number: string | null;
  fill_percent: number;
};

type Level = {
  id: number;
  rack_id: number;
  level_index: number;
  name: string | null;
  is_segmented: boolean;
  segments: Segment[];
};

type Rack = {
  id: number;
  name: string;
  levels: Level[];
};

export default function RacksTab() {
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRacks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/racks/", {
        params: { tenant_id: TENANT_ID, warehouse_id: WAREHOUSE_ID },
      });
      setRacks(Array.isArray(res.data) ? res.data : []);
    } catch (err: unknown) {
      console.error("[RacksTab] Błąd pobierania regałów:", err);
      setError("Nie udało się załadować regałów.");
      setRacks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRacks();
  }, []);

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
      <CartsListPageHeader title="Regały kompletacyjne" />
      <RackConfigurator onRackAdded={fetchRacks} />
      {racks.length === 0 ? (
        <AppEmptyState
          icon={Layers}
          title="Brak regałów"
          description="Dodaj regał w konfiguratorze powyżej."
        />
      ) : (
        <div className="space-y-3">
          {racks.map((rack) => (
            <div key={rack.id} className={cartsGroupShellClass}>
              <div className="border-b border-slate-200/90 px-3 py-2 text-[13px] font-semibold text-slate-900">
                {rack.name}
              </div>
              <div className="space-y-2 p-3">
                {[...(rack.levels || [])]
                  .sort((a, b) => a.level_index - b.level_index)
                  .map((level) => (
                    <div key={level.id} className="rounded-md border border-slate-200/90 bg-white p-2">
                      <div className={cartsSectionTitleClass}>
                        Poziom {level.level_index}
                        {level.name ? ` — ${level.name}` : ""}
                        {level.is_segmented ? " (segmenty)" : ""}
                      </div>
                      <div
                        className={
                          level.is_segmented && level.segments.length > 1 ? "mt-2 grid gap-2" : "mt-2 flex gap-2"
                        }
                        style={
                          level.is_segmented && level.segments.length > 1
                            ? { gridTemplateColumns: `repeat(${level.segments.length}, minmax(0, 1fr))` }
                            : undefined
                        }
                      >
                        {(level.segments || []).length === 0 ? (
                          <div className="rounded border border-dashed border-slate-200 p-2 text-[12px] text-slate-400">
                            Brak segmentów
                          </div>
                        ) : (
                          (level.segments || [])
                            .sort((a, b) => a.segment_index - b.segment_index)
                            .map((seg) => (
                              <div
                                key={seg.id}
                                className="min-h-[52px] rounded border border-slate-200/90 bg-white p-2"
                              >
                                <div className="text-[11px] font-medium text-slate-700">
                                  {seg.order_id ? `#${seg.order_number ?? seg.order_id}` : "—"}
                                </div>
                                <div className="mt-1">
                                  <ProgressBar percent={seg.fill_percent} />
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
