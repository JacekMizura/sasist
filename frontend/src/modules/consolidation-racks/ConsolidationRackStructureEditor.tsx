import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

import {
  cartsAppInputClass,
  cartsFieldLabelClass,
} from "../carts/cartsModuleTokens";
import { computeCapacityDm3, MAX_RACK_DIM, parseOptionalDim } from "./rackLayoutUtils";
import {
  addLevel,
  countSegments,
  levelSegmentsWidthSum,
  removeLevel,
  setLevelSegmentCount,
  type LevelDraft,
  type RackStructureDraft,
  type SegmentDraft,
} from "./rackStructureModel";
type Props = {
  draft: RackStructureDraft;
  onChange: (draft: RackStructureDraft) => void;
  warehouseLabel: string;
  warehouses: Array<{ id: number; name: string }>;
  showWarehouseSelect: boolean;
  structureLocked?: boolean;
  readOnly?: boolean;
  expandedLevels: Set<string>;
  onToggleLevel: (clientId: string) => void;
};

function DimInput({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <label className="block">
        <span className={cartsFieldLabelClass}>{label}</span>
        <div className="mt-1 font-mono tabular-nums text-sm text-slate-800">{value ?? "—"}</div>
      </label>
    );
  }
  return (
    <label className="block">
      <span className={cartsFieldLabelClass}>{label}</span>
      <input
        type="number"
        min={0}
        max={MAX_RACK_DIM}
        value={value ?? ""}
        onChange={(e) => onChange(parseOptionalDim(e.target.value))}
        className={`${cartsAppInputClass} mt-1 tabular-nums`}
      />
    </label>
  );
}

function SegmentFields({
  seg,
  lv,
  readOnly,
  onUpdate,
}: {
  seg: SegmentDraft;
  lv: LevelDraft;
  readOnly?: boolean;
  onUpdate: (patch: Partial<SegmentDraft>) => void;
}) {
  const cap = computeCapacityDm3(seg.depthMm, seg.widthMm, seg.heightMm ?? lv.levelHeightMm);
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white p-3">
      <div className="mb-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Segment {seg.segmentIndex + 1}
        </span>
      </div>
      <div className="space-y-2">
        <label className="block">
          <span className={cartsFieldLabelClass}>Nazwa (opcjonalnie)</span>
          {readOnly ? (
            <div className="mt-1 font-mono text-sm text-slate-800">{seg.slotLabel.trim() || "— auto —"}</div>
          ) : (
            <input
              type="text"
              value={seg.slotLabel}
              onChange={(e) => onUpdate({ slotLabel: e.target.value })}
              placeholder="np. A1 — puste = auto"
              className={`${cartsAppInputClass} mt-1 font-mono`}
            />
          )}
        </label>
        <div className="grid grid-cols-3 gap-2">
          <DimInput label="Szer. (mm)" value={seg.widthMm} onChange={(v) => onUpdate({ widthMm: v })} readOnly={readOnly} />
          <DimInput label="Głęb. (mm)" value={seg.depthMm} onChange={(v) => onUpdate({ depthMm: v })} readOnly={readOnly} />
          <DimInput
            label="Wys. (mm)"
            value={seg.heightMm ?? lv.levelHeightMm}
            onChange={(v) => onUpdate({ heightMm: v })}
            readOnly={readOnly}
          />
        </div>
        <div className="rounded border border-violet-100 bg-violet-50/40 px-2 py-1.5 text-xs">
          <span className="text-slate-600">Pojemność: </span>
          <span className="font-mono font-bold text-violet-900">{cap != null ? `${cap.toFixed(0)} dm³` : "—"}</span>
        </div>
      </div>
    </div>
  );
}

export default function ConsolidationRackStructureEditor({
  draft,
  onChange,
  warehouseLabel,
  warehouses,
  showWarehouseSelect,
  structureLocked = false,
  readOnly = false,
  expandedLevels,
  onToggleLevel,
}: Props) {
  const updateDraft = (patch: Partial<RackStructureDraft>) => onChange({ ...draft, ...patch });

  const updateLevel = (clientId: string, patch: Partial<LevelDraft>) => {
    onChange({
      ...draft,
      levels: draft.levels.map((lv) => (lv.clientId === clientId ? { ...lv, ...patch } : lv)),
    });
  };

  const updateSegment = (levelClientId: string, segmentClientId: string, patch: Partial<SegmentDraft>) => {
    onChange({
      ...draft,
      levels: draft.levels.map((lv) => {
        if (lv.clientId !== levelClientId) return lv;
        return {
          ...lv,
          segments: lv.segments.map((s) => (s.clientId === segmentClientId ? { ...s, ...patch } : s)),
        };
      }),
    });
  };

  const totalSegments = countSegments(draft);

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Dane regału</h2>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className={cartsFieldLabelClass}>Nazwa regału</span>
            {readOnly ? (
              <div className="mt-1 font-mono text-sm font-semibold text-slate-900">{draft.rackName}</div>
            ) : (
              <input
                type="text"
                value={draft.rackName}
                onChange={(e) => updateDraft({ rackName: e.target.value })}
                className={`${cartsAppInputClass} mt-1`}
                placeholder="RK-01"
              />
            )}
          </label>
          <label className="block">
            <span className={cartsFieldLabelClass}>Magazyn</span>
            {readOnly || !showWarehouseSelect ? (
              <div className="mt-1 text-sm font-medium text-slate-800">{warehouseLabel}</div>
            ) : (
              <select
                value={draft.warehouseId}
                onChange={(e) => updateDraft({ warehouseId: Number(e.target.value) })}
                className={`${cartsAppInputClass} mt-1`}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Parametry globalne</h2>
        <p className="mt-1 text-xs text-slate-500">Domyślne wymiary nowych segmentów i skala podglądu.</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <DimInput
            label="Szerokość regału (mm)"
            value={draft.totalWidthMm}
            onChange={(v) => updateDraft({ totalWidthMm: v })}
            readOnly={readOnly}
          />
          <DimInput
            label="Głębokość regału (mm)"
            value={draft.totalDepthMm}
            onChange={(v) => updateDraft({ totalDepthMm: v })}
            readOnly={readOnly}
          />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Poziomy</h2>
          <span className="text-xs tabular-nums text-slate-500">{draft.levels.length} poz. · {totalSegments} seg.</span>
        </div>

        <div className="mt-3 space-y-3">
          {draft.levels.map((lv) => {
            const expanded = expandedLevels.has(lv.clientId);
            const widthSum = levelSegmentsWidthSum(lv);
            const widthMismatch =
              draft.totalWidthMm != null && widthSum > 0 && Math.abs(widthSum - draft.totalWidthMm) > 5;
            return (
              <div key={lv.clientId} className="overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/30">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-80"
                    onClick={() => onToggleLevel(lv.clientId)}
                  >
                    {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">
                        Poziom {lv.levelIndex + 1}
                        {lv.name.trim() ? ` — ${lv.name.trim()}` : ""}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {lv.segments.length} segmentów · Σ szer. {widthSum || "—"} mm
                        {widthMismatch ? " · ⚠ różnica od szer. regału" : ""}
                      </div>
                    </div>
                  </button>
                  {!readOnly && !structureLocked && draft.levels.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => onChange(removeLevel(draft, lv.clientId))}
                      className="inline-flex h-7 shrink-0 items-center rounded border border-red-200 px-2 text-[11px] text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>

                {expanded ? (
                  <div className="space-y-3 border-t border-slate-200/60 bg-white px-3 py-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className={cartsFieldLabelClass}>Nazwa poziomu</span>
                        {readOnly ? (
                          <div className="mt-1 text-sm text-slate-800">{lv.name || "—"}</div>
                        ) : (
                          <input
                            type="text"
                            value={lv.name}
                            onChange={(e) => updateLevel(lv.clientId, { name: e.target.value })}
                            placeholder="np. A"
                            className={`${cartsAppInputClass} mt-1 font-mono`}
                          />
                        )}
                      </label>
                      <DimInput
                        label="Wysokość poziomu (mm)"
                        value={lv.levelHeightMm}
                        onChange={(v) => updateLevel(lv.clientId, { levelHeightMm: v })}
                        readOnly={readOnly}
                      />
                    </div>

                    <label className="block">
                      <span className={cartsFieldLabelClass}>Liczba segmentów na poziomie</span>
                      {readOnly || structureLocked ? (
                        <div className="mt-1 tabular-nums text-sm font-medium text-slate-800">{lv.segments.length}</div>
                      ) : (
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={lv.segments.length}
                            onChange={(e) => {
                              const n = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                              onChange(setLevelSegmentCount(draft, lv.clientId, n));
                            }}
                            className={`${cartsAppInputClass} w-24 tabular-nums`}
                          />
                          <span className="text-xs text-slate-500">segmentów — równy podział szerokości regału</span>
                        </div>
                      )}
                    </label>

                    <div className="space-y-2">
                      {lv.segments.map((seg) => (
                        <SegmentFields
                          key={seg.clientId}
                          seg={seg}
                          lv={lv}
                          readOnly={readOnly}
                          onUpdate={(patch) => updateSegment(lv.clientId, seg.clientId, patch)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {!readOnly && !structureLocked ? (
          <button
            type="button"
            onClick={() => onChange(addLevel(draft))}
            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50/50 text-sm font-medium text-violet-900 hover:bg-violet-100/60"
          >
            <Plus className="h-4 w-4" />
            Dodaj poziom
          </button>
        ) : structureLocked ? (
          <p className="mt-2 text-xs text-slate-500">
            Struktura poziomów i segmentów jest stała po utworzeniu regału. Możesz edytować nazwy i wymiary segmentów.
          </p>
        ) : null}
      </section>
    </div>
  );
}
