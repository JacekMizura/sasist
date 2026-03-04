import { useEffect, useState } from "react";

import api from "../../api/axios";
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
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-400 font-bold uppercase text-sm">
        Ładowanie regałów...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-red-200 text-red-600 font-bold">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black uppercase tracking-widest text-slate-700">
          Regały kompletacyjne
        </h2>
      </div>
      <RackConfigurator onRackAdded={fetchRacks} />
      {racks.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border-2 border-dashed border-slate-200 text-center text-slate-400 font-bold uppercase">
          Brak regałów. Dodaj regał w konfiguratorze powyżej.
        </div>
      ) : (
        <div className="space-y-8">
          {racks.map((rack) => (
            <div
              key={rack.id}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
            >
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-800">
                {rack.name}
              </div>
              {/* Shelf view: levels from top to bottom (level_index 0 = top) */}
              <div className="p-4 flex flex-col gap-3">
                {[...(rack.levels || [])]
                  .sort((a, b) => a.level_index - b.level_index)
                  .map((level) => (
                    <div
                      key={level.id}
                      className="border border-slate-200 rounded-lg p-3 bg-slate-50/50"
                    >
                      <div className="text-[10px] font-semibold text-slate-500 uppercase mb-2">
                        Poziom {level.level_index}
                        {level.name ? ` — ${level.name}` : ""}
                        {level.is_segmented ? " (segmenty)" : ""}
                      </div>
                      <div
                        className={
                          level.is_segmented && level.segments.length > 1
                            ? "grid gap-2"
                            : "flex gap-2"
                        }
                        style={
                          level.is_segmented && level.segments.length > 1
                            ? {
                                gridTemplateColumns: `repeat(${level.segments.length}, minmax(0, 1fr))`,
                              }
                            : undefined
                        }
                      >
                        {(level.segments || []).length === 0 ? (
                          <div className="rounded bg-slate-100 p-3 text-slate-400 text-xs">
                            Brak segmentów
                          </div>
                        ) : (
                          (level.segments || [])
                            .sort((a, b) => a.segment_index - b.segment_index)
                            .map((seg) => (
                              <div
                                key={seg.id}
                                className="rounded border border-slate-200 bg-white p-2 min-h-[60px]"
                              >
                                <div className="text-[10px] font-bold text-slate-600">
                                  {seg.order_id
                                    ? `#${seg.order_number ?? seg.order_id}`
                                    : "—"}
                                </div>
                                <div className="mt-1">
                                  <ProgressBar
                                    percent={seg.fill_percent}
                                  />
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
