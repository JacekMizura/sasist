import { useState } from "react";
import api from "../../api/axios";

const TENANT_ID = 1;
const WAREHOUSE_ID = 1;

type LevelConfig = {
  levelIndex: number;
  segmentCount: number;
  name: string;
  isSingleZone: boolean;
};

type RackConfiguratorProps = {
  onRackAdded: () => void;
};

export default function RackConfigurator({ onRackAdded }: RackConfiguratorProps) {
  const [rackName, setRackName] = useState("");
  const [levelCount, setLevelCount] = useState(3);
  const [levels, setLevels] = useState<LevelConfig[]>([
    { levelIndex: 0, segmentCount: 1, name: "", isSingleZone: true },
    { levelIndex: 1, segmentCount: 2, name: "", isSingleZone: false },
    { levelIndex: 2, segmentCount: 1, name: "", isSingleZone: true },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncLevelsFromCount = (count: number) => {
    setLevelCount(count);
    setLevels((prev) => {
      const next: LevelConfig[] = [];
      for (let i = 0; i < count; i++) {
        const existing = prev.find((l) => l.levelIndex === i);
        next.push(
          existing ?? {
            levelIndex: i,
            segmentCount: 1,
            name: "",
            isSingleZone: true,
          }
        );
      }
      return next;
    });
  };

  const setLevel = (index: number, patch: Partial<LevelConfig>) => {
    setLevels((prev) =>
      prev.map((l) => (l.levelIndex === index ? { ...l, ...patch } : l))
    );
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rackName.trim()) {
      setError("Podaj nazwę regału.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const levelsPayload = levels.map((l) => ({
        level_index: l.levelIndex,
        name: l.name.trim() || undefined,
        is_segmented: !l.isSingleZone && l.segmentCount > 1,
        segments: Array.from({ length: l.isSingleZone ? 1 : Math.max(1, l.segmentCount) }, (_, i) => ({
          segment_index: i,
          order_id: null,
          fill_percent: 0,
        })),
      }));
      await api.post("/racks/", {
        tenant_id: TENANT_ID,
        warehouse_id: WAREHOUSE_ID,
        name: rackName.trim(),
        levels: levelsPayload,
      });
      setRackName("");
      onRackAdded();
    } catch (err: unknown) {
      console.error("Rack create error:", err);
      setError("Nie udało się dodać regału.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-2">
        Konfigurator regału kompletacyjnego
      </h3>
      <form onSubmit={handleAdd} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
            Nazwa regału
          </label>
          <input
            type="text"
            value={rackName}
            onChange={(e) => setRackName(e.target.value)}
            placeholder="Regał A"
            className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
            Liczba poziomów (półek)
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={levelCount}
            onChange={(e) => syncLevelsFromCount(Number(e.target.value) || 1)}
            className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase mb-2">
            Ustawienia poziomów
          </div>
          <div className="space-y-3">
            {levels.map((l) => (
              <div
                key={l.levelIndex}
                className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200"
              >
                <span className="font-semibold text-slate-700">Poziom {l.levelIndex}</span>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={l.isSingleZone}
                    onChange={() => setLevel(l.levelIndex, { isSingleZone: true, segmentCount: 1 })}
                  />
                  <span className="text-xs">Jedna strefa (cała półka)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={!l.isSingleZone}
                    onChange={() => setLevel(l.levelIndex, { isSingleZone: false, segmentCount: l.segmentCount || 2 })}
                  />
                  <span className="text-xs">Podziel na przegrody</span>
                </label>
                {!l.isSingleZone && (
                  <>
                    <label className="text-xs text-slate-500">Liczba przegród:</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={l.segmentCount}
                      onChange={(e) =>
                        setLevel(l.levelIndex, {
                          segmentCount: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="w-16 rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  </>
                )}
                <input
                  type="text"
                  value={l.name}
                  onChange={(e) => setLevel(l.levelIndex, { name: e.target.value })}
                  placeholder="Nazwa (opcjonalnie)"
                  className="flex-1 min-w-[120px] rounded border border-slate-200 px-2 py-1 text-xs"
                />
              </div>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !rackName.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold uppercase disabled:opacity-50 hover:bg-blue-700"
        >
          {submitting ? "Zapisywanie…" : "Dodaj regał"}
        </button>
      </form>
    </div>
  );
}
