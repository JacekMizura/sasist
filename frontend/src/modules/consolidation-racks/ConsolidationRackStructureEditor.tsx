import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

import {
  cartsAppInputClass,
  cartsFieldLabelClass,
} from "../carts/cartsModuleTokens";
import { MAX_RACK_DIM, parseOptionalDim } from "./rackLayoutUtils";
import {
  addLevel,
  applyRackPreset,
  countSegments,
  levelWidthUsage,
  removeLevel,
  segmentDisplayLabel,
  setLevelSegmentCount,
  type LevelDraft,
  type RackPresetId,
  type RackStructureDraft,
  type SegmentSelection,
} from "./rackStructureModel";

type Props = {
  draft: RackStructureDraft;
  onChange: (draft: RackStructureDraft) => void;
  warehouseLabel: string;
  warehouses: Array<{ id: number; name: string }>;
  showWarehouseSelect: boolean;
  structureLocked?: boolean;
  readOnly?: boolean;
  /** Accordion — tylko jeden rozwinięty poziom */
  expandedLevelId: string | null;
  onExpandLevel: (levelClientId: string | null) => void;
  selection: SegmentSelection;
  onSelectSegment: (levelClientId: string, segmentClientId: string) => void;
  showPresets?: boolean;
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

export default function ConsolidationRackStructureEditor({
  draft,
  onChange,
  warehouseLabel,
  warehouses,
  showWarehouseSelect,
  structureLocked = false,
  readOnly = false,
  expandedLevelId,
  onExpandLevel,
  selection,
  onSelectSegment,
  showPresets = false,
}: Props) {
  const updateDraft = (patch: Partial<RackStructureDraft>) => onChange({ ...draft, ...patch });

  const updateLevel = (clientId: string, patch: Partial<LevelDraft>) => {
    onChange({
      ...draft,
      levels: draft.levels.map((lv) => (lv.clientId === clientId ? { ...lv, ...patch } : lv)),
    });
  };

  const totalSegments = countSegments(draft);

  const PRESETS: Array<{ id: RackPresetId; label: string; hint: string }> = [
    { id: "4x4", label: "4×4", hint: "4 poziomy × 4 segmenty" },
    { id: "3x6", label: "3×6", hint: "3 poziomy × 6 segmentów" },
    { id: "2x8", label: "2×8", hint: "2 poziomy × 8 segmentów" },
    { id: "empty", label: "Pusty regał", hint: "1 poziom, 1 segment" },
  ];

  const toggleLevel = (clientId: string) => {
    onExpandLevel(expandedLevelId === clientId ? null : clientId);
  };

  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Dane regału</h2>
        <div className="mt-2 space-y-2">
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
          <div className="grid grid-cols-2 gap-2">
            <DimInput
              label="Szerokość (mm)"
              value={draft.totalWidthMm}
              onChange={(v) => updateDraft({ totalWidthMm: v })}
              readOnly={readOnly}
            />
            <DimInput
              label="Głębokość (mm)"
              value={draft.totalDepthMm}
              onChange={(v) => updateDraft({ totalDepthMm: v })}
              readOnly={readOnly}
            />
          </div>
        </div>
      </section>

      {showPresets && !readOnly ? (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Szybki preset</h2>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.hint}
                onClick={() => onChange(applyRackPreset(p.id, draft.warehouseId))}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs font-medium text-slate-800 hover:border-violet-300 hover:bg-violet-50/50"
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Poziomy</h2>
          <span className="text-[11px] tabular-nums text-slate-500">{draft.levels.length} · {totalSegments} seg.</span>
        </div>

        <div className="mt-2 space-y-1.5">
          {draft.levels.map((lv) => {
            const expanded = expandedLevelId === lv.clientId;
            const usage = levelWidthUsage(lv, draft.totalWidthMm);
            const levelTitle = lv.name.trim() || String.fromCharCode(65 + lv.levelIndex);
            return (
              <div key={lv.clientId} className="overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/30">
                <div className="flex items-center gap-1 px-2 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:opacity-80"
                    onClick={() => toggleLevel(lv.clientId)}
                  >
                    {expanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">Poziom {levelTitle}</div>
                      <div className="text-[10px] tabular-nums text-slate-500">
                        {lv.segments.length} seg. · {usage.usedMm}/{usage.targetMm || "—"} mm
                      </div>
                    </div>
                  </button>
                  {!readOnly && !structureLocked && draft.levels.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => onChange(removeLevel(draft, lv.clientId))}
                      className="inline-flex h-6 shrink-0 items-center rounded border border-red-200 px-1.5 text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>

                {expanded ? (
                  <div className="space-y-2 border-t border-slate-200/60 bg-white px-2 py-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className={cartsFieldLabelClass}>Nazwa</span>
                        {readOnly ? (
                          <div className="mt-0.5 text-sm text-slate-800">{lv.name || "—"}</div>
                        ) : (
                          <input
                            type="text"
                            value={lv.name}
                            onChange={(e) => updateLevel(lv.clientId, { name: e.target.value })}
                            className={`${cartsAppInputClass} mt-0.5 font-mono text-sm`}
                          />
                        )}
                      </label>
                      <DimInput
                        label="Wysokość (mm)"
                        value={lv.levelHeightMm}
                        onChange={(v) => updateLevel(lv.clientId, { levelHeightMm: v })}
                        readOnly={readOnly}
                      />
                    </div>

                    <label className="block">
                      <span className={cartsFieldLabelClass}>Liczba segmentów</span>
                      {readOnly || structureLocked ? (
                        <div className="mt-0.5 tabular-nums text-sm font-medium">{lv.segments.length}</div>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={lv.segments.length}
                          onChange={(e) => {
                            const n = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                            onChange(setLevelSegmentCount(draft, lv.clientId, n));
                          }}
                          className={`${cartsAppInputClass} mt-0.5 w-20 tabular-nums text-sm`}
                        />
                      )}
                    </label>

                    <div>
                      <span className={cartsFieldLabelClass}>Segmenty</span>
                      <div className="mt-1 flex max-h-[120px] flex-wrap gap-1 overflow-y-auto">
                        {lv.segments.map((seg) => {
                          const label = segmentDisplayLabel(lv, seg);
                          const isActive =
                            selection?.levelClientId === lv.clientId
                            && selection.segmentClientId === seg.clientId;
                          return (
                            <button
                              key={seg.clientId}
                              type="button"
                              onClick={() => onSelectSegment(lv.clientId, seg.clientId)}
                              className={`rounded border px-2 py-0.5 font-mono text-xs font-semibold transition-colors ${
                                isActive
                                  ? "border-orange-500 bg-orange-50 text-orange-950"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50/40"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      className={`rounded px-2 py-1 text-[10px] tabular-nums ${
                        usage.valid
                          ? "bg-emerald-50/80 text-emerald-900"
                          : "bg-red-50/80 font-medium text-red-900"
                      }`}
                    >
                      Wykorzystano {usage.usedMm} / {usage.targetMm || "—"} mm
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
            className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50/50 text-xs font-medium text-violet-900 hover:bg-violet-100/60"
          >
            <Plus className="h-3.5 w-3.5" />
            Dodaj poziom
          </button>
        ) : structureLocked ? (
          <p className="mt-2 text-[11px] text-slate-500">
            Kliknij segment na liście lub w podglądzie, aby edytować wymiary.
          </p>
        ) : null}
      </section>
    </div>
  );
}
