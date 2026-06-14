import { Copy, Plus, Trash2 } from "lucide-react";

import { cartsAppInputClass, cartsFieldLabelClass } from "../carts/cartsModuleTokens";
import { MAX_RACK_DIM, parseOptionalDim } from "./rackLayoutUtils";
import {
  addSegment,
  duplicateLevel,
  levelWidthUsage,
  removeLevel,
  removeSegment,
  segmentDisplayLabel,
  type LevelDraft,
  type RackStructureDraft,
  type SegmentSelection,
} from "./rackStructureModel";

type Props = {
  draft: RackStructureDraft;
  readOnly?: boolean;
  structureLocked?: boolean;
  focusedLevelId: string | null;
  selection: SegmentSelection;
  onChange: (draft: RackStructureDraft) => void;
  onSelectLevel: (levelClientId: string) => void;
  onSelectSegment: (levelClientId: string, segmentClientId: string) => void;
};

function TreeConnector({ isLast }: { isLast: boolean }) {
  return (
    <span className="inline-block w-4 shrink-0 font-mono text-[11px] leading-none text-slate-400">
      {isLast ? "└" : "├"}
    </span>
  );
}

export default function RackStructureTree({
  draft,
  readOnly = false,
  structureLocked = false,
  focusedLevelId,
  selection,
  onChange,
  onSelectLevel,
  onSelectSegment,
}: Props) {
  const canEditStructure = !readOnly && !structureLocked;

  const updateLevel = (clientId: string, patch: Partial<LevelDraft>) => {
    onChange({
      ...draft,
      levels: draft.levels.map((lv) => (lv.clientId === clientId ? { ...lv, ...patch } : lv)),
    });
  };

  return (
    <div className="max-h-[min(520px,50vh)] space-y-2 overflow-y-auto pr-0.5">
      {draft.levels.map((lv) => {
        const levelTitle = lv.name.trim() || String.fromCharCode(65 + lv.levelIndex);
        const levelFocused = focusedLevelId === lv.clientId;
        const levelSelected = selection?.levelClientId === lv.clientId;
        const usage = levelWidthUsage(lv, draft.totalWidthMm);
        const segCount = lv.segments.length;

        return (
          <div
            key={lv.clientId}
            className={`rounded-lg border bg-white ${
              levelFocused || levelSelected ? "border-orange-300" : "border-slate-200"
            }`}
          >
            <div className="flex items-start gap-1 px-2 py-1.5">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onSelectLevel(lv.clientId)}
              >
                <div className="text-sm font-semibold text-slate-800">Poziom {levelTitle}</div>
                <div className="text-[10px] tabular-nums text-slate-500">
                  {segCount} {segCount === 1 ? "segment" : "segmentów"}
                  {usage.targetMm > 0 ? ` · ${usage.usedMm}/${usage.targetMm} mm` : null}
                </div>
              </button>
              {canEditStructure ? (
                <div className="flex shrink-0 gap-0.5">
                  <button
                    type="button"
                    title="Duplikuj poziom"
                    onClick={() => onChange(duplicateLevel(draft, lv.clientId))}
                    className="inline-flex h-6 items-center rounded border border-slate-200 px-1 text-slate-600 hover:border-violet-300 hover:text-violet-900"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  {draft.levels.length > 1 ? (
                    <button
                      type="button"
                      title="Usuń poziom"
                      onClick={() => onChange(removeLevel(draft, lv.clientId))}
                      className="inline-flex h-6 items-center rounded border border-red-200 px-1 text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {levelFocused ? (
              <div className="space-y-2 border-t border-slate-100 px-2 py-2">
                {!readOnly ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className={cartsFieldLabelClass}>Nazwa</span>
                      <input
                        type="text"
                        value={lv.name}
                        onChange={(e) => updateLevel(lv.clientId, { name: e.target.value })}
                        className={`${cartsAppInputClass} mt-0.5 font-mono text-xs`}
                      />
                    </label>
                    <label className="block">
                      <span className={cartsFieldLabelClass}>Wys. (mm)</span>
                      <input
                        type="number"
                        min={0}
                        max={MAX_RACK_DIM}
                        value={lv.levelHeightMm ?? ""}
                        onChange={(e) =>
                          updateLevel(lv.clientId, { levelHeightMm: parseOptionalDim(e.target.value) })
                        }
                        className={`${cartsAppInputClass} mt-0.5 tabular-nums text-xs`}
                      />
                    </label>
                  </div>
                ) : null}

                <div className="space-y-0.5 pl-1">
                  {lv.segments.map((seg, segIdx) => {
                    const label = segmentDisplayLabel(lv, seg);
                    const isLast = segIdx === lv.segments.length - 1;
                    const isActive =
                      selection?.levelClientId === lv.clientId
                      && selection.segmentClientId === seg.clientId;
                    return (
                      <div key={seg.clientId} className="flex items-center gap-0.5">
                        <TreeConnector isLast={isLast} />
                        <button
                          type="button"
                          onClick={() => onSelectSegment(lv.clientId, seg.clientId)}
                          className={`min-w-0 flex-1 rounded px-1.5 py-0.5 text-left font-mono text-xs font-semibold ${
                            isActive
                              ? "bg-orange-50 text-orange-950 ring-1 ring-orange-400"
                              : "text-slate-700 hover:bg-violet-50/50"
                          }`}
                        >
                          {label}
                        </button>
                        {canEditStructure && lv.segments.length > 1 ? (
                          <button
                            type="button"
                            title="Usuń segment"
                            onClick={() => onChange(removeSegment(draft, lv.clientId, seg.clientId))}
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {canEditStructure ? (
                  <button
                    type="button"
                    onClick={() => onChange(addSegment(draft, lv.clientId))}
                    className="inline-flex h-7 w-full items-center justify-center gap-1 rounded border border-violet-200 bg-white text-[11px] font-medium text-violet-900 hover:bg-violet-50/60"
                  >
                    <Plus className="h-3 w-3" />
                    Dodaj segment
                  </button>
                ) : null}

                {!usage.valid && usage.targetMm > 0 ? (
                  <p className="text-[10px] font-medium text-red-700">
                    Suma szer.: {usage.usedMm}/{usage.targetMm} mm
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="border-t border-slate-100 px-2 py-1.5 pl-3">
                {lv.segments.map((seg, segIdx) => {
                  const label = segmentDisplayLabel(lv, seg);
                  const isLast = segIdx === lv.segments.length - 1;
                  const isActive =
                    selection?.levelClientId === lv.clientId
                    && selection.segmentClientId === seg.clientId;
                  return (
                    <div key={seg.clientId} className="flex items-center gap-0.5">
                      <TreeConnector isLast={isLast} />
                      <button
                        type="button"
                        onClick={() => onSelectSegment(lv.clientId, seg.clientId)}
                        className={`rounded px-1 py-0.5 font-mono text-xs font-medium ${
                          isActive ? "text-orange-700" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {label}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
