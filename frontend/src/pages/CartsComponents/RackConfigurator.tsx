import { useState } from "react";

import api from "../../api/axios";
import {
  cartsAppInputClass,
  cartsBtnApply,
  cartsFieldLabelClass,
  cartsSectionClass,
  cartsSectionTitleClass,
} from "../../modules/carts/cartsModuleTokens";

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
    setLevels((prev) => prev.map((l) => (l.levelIndex === index ? { ...l, ...patch } : l)));
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
    <div className={cartsSectionClass}>
      <h3 className={cartsSectionTitleClass}>Konfigurator regału kompletacyjnego</h3>
      <form onSubmit={handleAdd} className="mt-2 space-y-3">
        <div className="max-w-xs">
          <label className={cartsFieldLabelClass}>Nazwa regału</label>
          <input
            type="text"
            value={rackName}
            onChange={(e) => setRackName(e.target.value)}
            placeholder="Regał A"
            className={cartsAppInputClass}
          />
        </div>
        <div className="max-w-[6rem]">
          <label className={cartsFieldLabelClass}>Liczba poziomów (półek)</label>
          <input
            type="number"
            min={1}
            max={20}
            value={levelCount}
            onChange={(e) => syncLevelsFromCount(Number(e.target.value) || 1)}
            className={`${cartsAppInputClass} no-number-spinner`}
          />
        </div>
        <div>
          <div className={cartsFieldLabelClass}>Ustawienia poziomów</div>
          <div className="space-y-2">
            {levels.map((l) => (
              <div
                key={l.levelIndex}
                className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200/90 bg-white p-2"
              >
                <span className="text-[13px] font-medium text-slate-800">Poziom {l.levelIndex}</span>
                <label className="flex items-center gap-1.5 text-[12px] text-slate-700">
                  <input
                    type="radio"
                    checked={l.isSingleZone}
                    onChange={() => setLevel(l.levelIndex, { isSingleZone: true, segmentCount: 1 })}
                  />
                  Jedna strefa (cała półka)
                </label>
                <label className="flex items-center gap-1.5 text-[12px] text-slate-700">
                  <input
                    type="radio"
                    checked={!l.isSingleZone}
                    onChange={() => setLevel(l.levelIndex, { isSingleZone: false, segmentCount: l.segmentCount || 2 })}
                  />
                  Podziel na przegrody
                </label>
                {!l.isSingleZone ? (
                  <>
                    <span className="text-[12px] text-slate-500">Liczba przegród:</span>
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
                      className={`${cartsAppInputClass} w-16`}
                    />
                  </>
                ) : null}
                <input
                  type="text"
                  value={l.name}
                  onChange={(e) => setLevel(l.levelIndex, { name: e.target.value })}
                  placeholder="Nazwa (opcjonalnie)"
                  className={`${cartsAppInputClass} min-w-[8rem] flex-1`}
                />
              </div>
            ))}
          </div>
        </div>
        {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
        <button type="submit" disabled={submitting || !rackName.trim()} className={cartsBtnApply}>
          {submitting ? "Zapisywanie…" : "Dodaj regał"}
        </button>
      </form>
    </div>
  );
}
