import { Copy, Plus, Trash2 } from "lucide-react";

import { cartsAppInputClass, cartsFieldLabelClass } from "../carts/cartsModuleTokens";
import { MAX_RACK_DIM, parseOptionalDim } from "./rackLayoutUtils";
import {
  addBay,
  addLevel,
  addSegment,
  duplicateBay,
  duplicateLevel,
  levelWidthUsage,
  removeBay,
  removeLevel,
  removeSegment,
  segmentDisplayLabel,
  type BayDraft,
  type LevelDraft,
  type RackStructureDraft,
  type SegmentSelection,
} from "./rackStructureModel";

type Props = {
  draft: RackStructureDraft;
  readOnly?: boolean;
  structureLocked?: boolean;
  focusedBayId: string | null;
  focusedLevelId: string | null;
  selection: SegmentSelection;
  onChange: (draft: RackStructureDraft) => void;
  onSelectBay: (bayClientId: string) => void;
  onSelectLevel: (bayClientId: string, levelClientId: string) => void;
  onSelectSegment: (bayClientId: string, levelClientId: string, segmentClientId: string) => void;
};

function TreeConnector({ isLast }: { isLast: boolean }) {
  return (
    <span className="inline-block w-4 shrink-0 font-mono text-[11px] leading-none text-slate-400">
      {isLast ? "└" : "├"}
    </span>
  );
}

function BayLevels({
  bay,
  draft,
  readOnly,
  structureLocked,
  focusedLevelId,
  selection,
  onChange,
  onSelectLevel,
  onSelectSegment,
}: {
  bay: BayDraft;
  draft: RackStructureDraft;
  readOnly: boolean;
  structureLocked: boolean;
  focusedLevelId: string | null;
  selection: SegmentSelection;
  onChange: (draft: RackStructureDraft) => void;
  onSelectLevel: (bayClientId: string, levelClientId: string) => void;
  onSelectSegment: (bayClientId: string, levelClientId: string, segmentClientId: string) => void;
}) {
  const canEditStructure = !readOnly && !structureLocked;

  const updateLevel = (clientId: string, patch: Partial<LevelDraft>) => {
    onChange({
      ...draft,
      bays: draft.bays.map((b) =>
        b.clientId !== bay.clientId
          ? b
          : { ...b, levels: b.levels.map((lv) => (lv.clientId === clientId ? { ...lv, ...patch } : lv)) },
      ),
    });
  };

  return (
    <div className="space-y-1 pl-2 pb-2">
      {bay.levels.map((lv, lvIdx) => {
        const levelTitle = lv.name.trim() || String.fromCharCode(65 + lv.levelIndex);
        const levelFocused = focusedLevelId === lv.clientId;
        const isLastLevel = lvIdx === bay.levels.length - 1;
        const usage = levelWidthUsage(lv, draft.totalWidthMm);

        return (
          <div key={lv.clientId}>
            <div className="flex items-center gap-0.5">
              <TreeConnector isLast={isLastLevel && !levelFocused} />
              <button
                type="button"
                onClick={() => onSelectLevel(bay.clientId, lv.clientId)}
                className={`min-w-0 flex-1 rounded px-1 py-0.5 text-left text-xs font-semibold ${
                  levelFocused ? "text-orange-900" : "text-slate-700 hover:text-slate-900"
                }`}
              >
                Poziom {levelTitle}
              </button>
              {canEditStructure && bay.levels.length > 1 ? (
                <button
                  type="button"
                  title="Usuń poziom"
                  onClick={() => onChange(removeLevel(draft, bay.clientId, lv.clientId))}
                  className="text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </div>

            {levelFocused ? (
              <div className="ml-5 space-y-1 border-l border-slate-100 pl-2 pb-1">
                {!readOnly ? (
                  <div className="grid grid-cols-2 gap-1 pt-1">
                    <input
                      type="text"
                      value={lv.name}
                      onChange={(e) => updateLevel(lv.clientId, { name: e.target.value })}
                      className={`${cartsAppInputClass} font-mono text-xs`}
                      placeholder="Nazwa"
                    />
                    <input
                      type="number"
                      min={0}
                      max={MAX_RACK_DIM}
                      value={lv.levelHeightMm ?? ""}
                      onChange={(e) =>
                        updateLevel(lv.clientId, { levelHeightMm: parseOptionalDim(e.target.value) })
                      }
                      className={`${cartsAppInputClass} tabular-nums text-xs`}
                      placeholder="Wys. mm"
                    />
                  </div>
                ) : null}
                {lv.segments.map((seg, segIdx) => {
                  const label = segmentDisplayLabel(lv, seg);
                  const isActive =
                    selection?.bayClientId === bay.clientId
                    && selection.levelClientId === lv.clientId
                    && selection.segmentClientId === seg.clientId;
                  return (
                    <div key={seg.clientId} className="flex items-center gap-0.5">
                      <TreeConnector isLast={segIdx === lv.segments.length - 1} />
                      <button
                        type="button"
                        onClick={() => onSelectSegment(bay.clientId, lv.clientId, seg.clientId)}
                        className={`min-w-0 flex-1 rounded px-1 py-0.5 text-left font-mono text-xs font-semibold ${
                          isActive ? "bg-orange-50 text-orange-950 ring-1 ring-orange-400" : "text-slate-600"
                        }`}
                      >
                        {label}
                      </button>
                      {canEditStructure && lv.segments.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => onChange(removeSegment(draft, bay.clientId, lv.clientId, seg.clientId))}
                          className="text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {canEditStructure ? (
                  <button
                    type="button"
                    onClick={() => onChange(addSegment(draft, bay.clientId, lv.clientId))}
                    className="mt-1 inline-flex h-6 items-center gap-1 rounded border border-violet-200 px-2 text-[10px] font-medium text-violet-900 hover:bg-violet-50/60"
                  >
                    <Plus className="h-3 w-3" />
                    Dodaj segment
                  </button>
                ) : null}
                {!usage.valid && usage.targetMm > 0 ? (
                  <p className="text-[10px] text-red-700">Szer.: {usage.usedMm}/{usage.targetMm} mm</p>
                ) : null}
                {canEditStructure ? (
                  <button
                    type="button"
                    onClick={() => onChange(duplicateLevel(draft, bay.clientId, lv.clientId))}
                    className="text-[10px] text-violet-800 hover:underline"
                  >
                    Duplikuj poziom
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="ml-5 pl-2">
                {lv.segments.map((seg, segIdx) => {
                  const label = segmentDisplayLabel(lv, seg);
                  const isActive =
                    selection?.bayClientId === bay.clientId
                    && selection.levelClientId === lv.clientId
                    && selection.segmentClientId === seg.clientId;
                  return (
                    <div key={seg.clientId} className="flex items-center gap-0.5">
                      <TreeConnector isLast={segIdx === lv.segments.length - 1} />
                      <button
                        type="button"
                        onClick={() => onSelectSegment(bay.clientId, lv.clientId, seg.clientId)}
                        className={`font-mono text-xs ${isActive ? "text-orange-700" : "text-slate-500"}`}
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

export default function RackStructureTree({
  draft,
  readOnly = false,
  structureLocked = false,
  focusedBayId,
  focusedLevelId,
  selection,
  onChange,
  onSelectBay,
  onSelectLevel,
  onSelectSegment,
}: Props) {
  const canEditStructure = !readOnly && !structureLocked;

  const updateBay = (clientId: string, patch: Partial<BayDraft>) => {
    onChange({
      ...draft,
      bays: draft.bays.map((b) => (b.clientId === clientId ? { ...b, ...patch } : b)),
    });
  };

  return (
    <div className="max-h-[min(520px,50vh)] space-y-2 overflow-y-auto pr-0.5">
      <div className="text-sm font-bold text-slate-800">{draft.rackName.trim() || "RK-XX"}</div>
      {draft.bays.map((bay) => {
        const bayFocused = focusedBayId === bay.clientId;
        return (
          <div
            key={bay.clientId}
            className={`rounded-lg border bg-white ${
              bayFocused ? "border-orange-300" : "border-slate-200"
            }`}
          >
            <div className="flex items-start gap-1 px-2 py-1.5">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelectBay(bay.clientId)}>
                <div className="text-sm font-semibold text-slate-800">Rack {bay.name}</div>
                <div className="text-[10px] text-slate-500">
                  {bay.levels.length} {bay.levels.length === 1 ? "poziom" : "poziomów"}
                </div>
              </button>
              {canEditStructure ? (
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    title="Duplikuj rack"
                    onClick={() => onChange(duplicateBay(draft, bay.clientId))}
                    className="inline-flex h-6 items-center rounded border border-slate-200 px-1 text-slate-600"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  {draft.bays.length > 1 ? (
                    <button
                      type="button"
                      title="Usuń rack"
                      onClick={() => onChange(removeBay(draft, bay.clientId))}
                      className="inline-flex h-6 items-center rounded border border-red-200 px-1 text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {bayFocused && !readOnly ? (
              <div className="space-y-1 border-t border-slate-100 px-2 py-2">
                <label className="block">
                  <span className={cartsFieldLabelClass}>Nazwa racka</span>
                  <input
                    type="text"
                    value={bay.name}
                    onChange={(e) => updateBay(bay.clientId, { name: e.target.value })}
                    className={`${cartsAppInputClass} mt-0.5 font-mono text-xs`}
                  />
                </label>
                <label className="block">
                  <span className={cartsFieldLabelClass}>Opis (opcj.)</span>
                  <input
                    type="text"
                    value={bay.description}
                    onChange={(e) => updateBay(bay.clientId, { description: e.target.value })}
                    className={`${cartsAppInputClass} mt-0.5 text-xs`}
                  />
                </label>
                {canEditStructure ? (
                  <button
                    type="button"
                    onClick={() => onChange(addLevel(draft, bay.clientId))}
                    className="inline-flex h-7 w-full items-center justify-center gap-1 rounded border border-violet-200 text-[11px] font-medium text-violet-900 hover:bg-violet-50/60"
                  >
                    <Plus className="h-3 w-3" />
                    Dodaj poziom
                  </button>
                ) : null}
              </div>
            ) : null}

            <BayLevels
              bay={bay}
              draft={draft}
              readOnly={readOnly}
              structureLocked={structureLocked}
              focusedLevelId={bayFocused ? focusedLevelId : null}
              selection={selection}
              onChange={onChange}
              onSelectLevel={onSelectLevel}
              onSelectSegment={onSelectSegment}
            />
          </div>
        );
      })}
    </div>
  );
}
