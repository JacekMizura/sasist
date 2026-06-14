import { Copy, Plus, Trash2 } from "lucide-react";

import {
  addLevel,
  bayDisplayLabel,
  duplicateBay,
  duplicateLevel,
  removeBay,
  removeLevel,
  type BayDraft,
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
  structureLocked,
  readOnly,
  focusedLevelId,
  onChange,
  onSelectLevel,
}: {
  bay: BayDraft;
  draft: RackStructureDraft;
  structureLocked: boolean;
  readOnly: boolean;
  focusedLevelId: string | null;
  onChange: (draft: RackStructureDraft) => void;
  onSelectLevel: (bayClientId: string, levelClientId: string) => void;
}) {
  const canEditStructure = !readOnly && !structureLocked;

  return (
    <div className="space-y-0.5 pl-2 pb-2">
      {bay.levels.map((lv, lvIdx) => {
        const levelTitle = lv.name.trim() || String.fromCharCode(65 + lv.levelIndex);
        const levelFocused = focusedLevelId === lv.clientId;
        const isLastLevel = lvIdx === bay.levels.length - 1;

        return (
          <div key={lv.clientId} className="flex items-center gap-0.5">
            <TreeConnector isLast={isLastLevel} />
            <button
              type="button"
              onClick={() => onSelectLevel(bay.clientId, lv.clientId)}
              className={`min-w-0 flex-1 rounded px-1 py-0.5 text-left text-xs font-semibold ${
                levelFocused ? "bg-orange-50 text-orange-950 ring-1 ring-orange-300" : "text-slate-700 hover:text-slate-900"
              }`}
            >
              Poziom {levelTitle}
              <span className="ml-1 font-normal text-slate-500">({lv.segments.length} seg.)</span>
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
            {canEditStructure ? (
              <button
                type="button"
                title="Duplikuj poziom"
                onClick={() => onChange(duplicateLevel(draft, bay.clientId, lv.clientId))}
                className="text-slate-500 hover:text-violet-800"
              >
                <Copy className="h-3 w-3" />
              </button>
            ) : null}
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
  selection: _selection,
  onChange,
  onSelectBay,
  onSelectLevel,
  onSelectSegment: _onSelectSegment,
}: Props) {
  const canEditStructure = !readOnly && !structureLocked;

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
                <div className="text-sm font-semibold text-slate-800">{bayDisplayLabel(bay)}</div>
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

            {bayFocused && canEditStructure ? (
              <div className="border-t border-slate-100 px-2 py-2">
                <button
                  type="button"
                  onClick={() => onChange(addLevel(draft, bay.clientId))}
                  className="inline-flex h-7 w-full items-center justify-center gap-1 rounded border border-violet-200 text-[11px] font-medium text-violet-900 hover:bg-violet-50/60"
                >
                  <Plus className="h-3 w-3" />
                  Dodaj poziom
                </button>
              </div>
            ) : null}

            {bayFocused ? (
              <BayLevels
                bay={bay}
                draft={draft}
                structureLocked={structureLocked}
                readOnly={readOnly}
                focusedLevelId={focusedLevelId}
                onChange={onChange}
                onSelectLevel={onSelectLevel}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
