import { useState } from "react";

import { cartsAppInputClass } from "../carts/cartsModuleTokens";
import { MAX_RACK_DIM, parseOptionalDim } from "./rackLayoutUtils";
import {
  applySegmentNameNumbering,
  copyDepthToAllSegmentsInLevel,
  copyFirstSegmentDimensionsToLevel,
  copyHeightToAllSegmentsInLevel,
  segmentDisplayLabel,
  type LevelDraft,
  type RackStructureDraft,
  type SegmentDraft,
  type SegmentSelection,
} from "./rackStructureModel";

type Props = {
  draft: RackStructureDraft;
  level: LevelDraft;
  readOnly?: boolean;
  selection: SegmentSelection;
  onChange: (draft: RackStructureDraft) => void;
  onSelectSegment: (levelClientId: string, segmentClientId: string) => void;
};

const thClass = "px-1.5 py-1 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500";
const tdClass = "px-1 py-0.5 align-middle";
const inputClass = `${cartsAppInputClass} h-7 w-full min-w-0 px-1.5 py-0 text-xs tabular-nums`;

export default function LevelSegmentTable({
  draft,
  level,
  readOnly = false,
  selection,
  onChange,
  onSelectSegment,
}: Props) {
  const [namePrefix, setNamePrefix] = useState("");

  const updateSegment = (segmentClientId: string, patch: Partial<SegmentDraft>) => {
    onChange({
      ...draft,
      levels: draft.levels.map((lv) => {
        if (lv.clientId !== level.clientId) return lv;
        return {
          ...lv,
          segments: lv.segments.map((s) => (s.clientId === segmentClientId ? { ...s, ...patch } : s)),
        };
      }),
    });
  };

  return (
    <div className="space-y-2">
      <div className="max-h-[220px] overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[280px] border-collapse text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white">
            <tr>
              <th className={thClass}>Seg</th>
              <th className={thClass}>SZ</th>
              <th className={thClass}>GŁ</th>
              <th className={thClass}>WYS</th>
              <th className={thClass}>Nazwa</th>
            </tr>
          </thead>
          <tbody>
            {level.segments.map((seg) => {
              const slotLabel = segmentDisplayLabel(level, seg);
              const isActive =
                selection?.levelClientId === level.clientId
                && selection.segmentClientId === seg.clientId;
              return (
                <tr
                  key={seg.clientId}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 ${
                    isActive ? "bg-orange-50/90" : "hover:bg-violet-50/40"
                  }`}
                  onClick={() => onSelectSegment(level.clientId, seg.clientId)}
                >
                  <td className={`${tdClass} font-mono font-bold text-slate-900`}>{slotLabel}</td>
                  <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                    {readOnly ? (
                      <span className="tabular-nums">{seg.widthMm ?? "—"}</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        max={MAX_RACK_DIM}
                        value={seg.widthMm ?? ""}
                        onChange={(e) => updateSegment(seg.clientId, { widthMm: parseOptionalDim(e.target.value) })}
                        className={inputClass}
                      />
                    )}
                  </td>
                  <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                    {readOnly ? (
                      <span className="tabular-nums">{seg.depthMm ?? "—"}</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        max={MAX_RACK_DIM}
                        value={seg.depthMm ?? ""}
                        onChange={(e) => updateSegment(seg.clientId, { depthMm: parseOptionalDim(e.target.value) })}
                        className={inputClass}
                      />
                    )}
                  </td>
                  <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                    {readOnly ? (
                      <span className="tabular-nums">{seg.heightMm ?? level.levelHeightMm ?? "—"}</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        max={MAX_RACK_DIM}
                        value={seg.heightMm ?? level.levelHeightMm ?? ""}
                        onChange={(e) => updateSegment(seg.clientId, { heightMm: parseOptionalDim(e.target.value) })}
                        className={inputClass}
                      />
                    )}
                  </td>
                  <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                    {readOnly ? (
                      <span className="font-mono">{seg.slotLabel.trim() || "—"}</span>
                    ) : (
                      <input
                        type="text"
                        value={seg.slotLabel}
                        onChange={(e) => updateSegment(seg.clientId, { slotLabel: e.target.value })}
                        placeholder="auto"
                        className={`${inputClass} font-mono`}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!readOnly ? (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Operacje masowe</div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:border-violet-300"
              onClick={() => onChange(copyFirstSegmentDimensionsToLevel(draft, level.clientId))}
            >
              Kopiuj wymiary na wszystkie
            </button>
            <button
              type="button"
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:border-violet-300"
              onClick={() => onChange(copyDepthToAllSegmentsInLevel(draft, level.clientId))}
            >
              Kopiuj głębokość
            </button>
            <button
              type="button"
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:border-violet-300"
              onClick={() => onChange(copyHeightToAllSegmentsInLevel(draft, level.clientId))}
            >
              Kopiuj wysokość
            </button>
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              value={namePrefix}
              onChange={(e) => setNamePrefix(e.target.value)}
              placeholder="np. TV"
              className={`${cartsAppInputClass} h-7 flex-1 text-xs`}
            />
            <button
              type="button"
              disabled={!namePrefix.trim()}
              className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:border-violet-300 disabled:opacity-40"
              onClick={() => onChange(applySegmentNameNumbering(draft, level.clientId, namePrefix))}
            >
              Nazwa z numeracją
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
