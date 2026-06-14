import { Copy, Plus, Trash2 } from "lucide-react";

import { cartsAppInputClass } from "../carts/cartsModuleTokens";
import { MAX_RACK_DIM, parseOptionalDim } from "./rackLayoutUtils";
import {
  addSegment,
  duplicateSegment,
  levelWidthUsage,
  removeSegment,
  segmentDisplayLabel,
  type BayDraft,
  type LevelDraft,
  type RackStructureDraft,
  type SegmentDraft,
  type SegmentSelection,
} from "./rackStructureModel";

type Props = {
  draft: RackStructureDraft;
  bay: BayDraft;
  level: LevelDraft;
  readOnly?: boolean;
  /** Blokuje dodawanie/usuwanie segmentów i poziomów; wymiary nadal edytowalne. */
  structureLocked?: boolean;
  selection: SegmentSelection;
  onChange: (draft: RackStructureDraft) => void;
  onSelectSegment: (bayClientId: string, levelClientId: string, segmentClientId: string) => void;
};

const thClass = "px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500";
const tdClass = "px-1.5 py-1 align-middle";
const inputClass = `${cartsAppInputClass} h-8 w-full min-w-0 px-2 text-xs tabular-nums`;

export default function LevelSegmentConfigTable({
  draft,
  bay,
  level,
  readOnly = false,
  structureLocked = false,
  selection,
  onChange,
  onSelectSegment,
}: Props) {
  const canEditDims = !readOnly;
  const canEditStructure = !readOnly && !structureLocked;
  const usage = levelWidthUsage(level, draft.totalWidthMm);
  const levelTitle = level.name.trim() || String.fromCharCode(65 + level.levelIndex);

  const updateSegment = (segmentClientId: string, patch: Partial<SegmentDraft>) => {
    onChange({
      ...draft,
      bays: draft.bays.map((b) => {
        if (b.clientId !== bay.clientId) return b;
        return {
          ...b,
          levels: b.levels.map((lv) => {
            if (lv.clientId !== level.clientId) return lv;
            return {
              ...lv,
              segments: lv.segments.map((s) =>
                s.clientId === segmentClientId ? { ...s, ...patch } : s,
              ),
            };
          }),
        };
      }),
    });
  };

  return (
    <section className="shrink-0 rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Poziom {levelTitle} — segmenty
        </h3>
        <span
          className={`text-[11px] tabular-nums ${
            usage.valid ? "text-emerald-800" : "text-red-700 font-medium"
          }`}
        >
          Szerokość: {usage.usedMm} / {usage.targetMm || "—"} mm
        </span>
      </div>

      <div className="max-h-[min(280px,40vh)] overflow-auto">
        <table className="w-full min-w-[480px] border-collapse text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white">
            <tr>
              <th className={thClass}>Segment</th>
              <th className={thClass}>Szerokość</th>
              <th className={thClass}>Głębokość</th>
              <th className={thClass}>Wysokość</th>
              <th className={thClass}>Nazwa</th>
              {canEditStructure ? <th className={`${thClass} w-16`} /> : null}
            </tr>
          </thead>
          <tbody>
            {level.segments.map((seg) => {
              const slotLabel = segmentDisplayLabel(level, seg);
              const isActive =
                selection?.bayClientId === bay.clientId
                && selection.levelClientId === level.clientId
                && selection.segmentClientId === seg.clientId;

              return (
                <tr
                  key={seg.clientId}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 ${
                    isActive ? "bg-orange-50/90" : "hover:bg-violet-50/40"
                  }`}
                  onClick={() => onSelectSegment(bay.clientId, level.clientId, seg.clientId)}
                >
                  <td className={`${tdClass} font-mono font-bold text-slate-900`}>{slotLabel}</td>
                  <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                    {canEditDims ? (
                      <input
                        type="number"
                        min={0}
                        max={MAX_RACK_DIM}
                        value={seg.widthMm ?? ""}
                        onChange={(e) => updateSegment(seg.clientId, { widthMm: parseOptionalDim(e.target.value) })}
                        className={inputClass}
                      />
                    ) : (
                      <span className="tabular-nums">{seg.widthMm ?? "—"}</span>
                    )}
                  </td>
                  <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                    {canEditDims ? (
                      <input
                        type="number"
                        min={0}
                        max={MAX_RACK_DIM}
                        value={seg.depthMm ?? ""}
                        onChange={(e) => updateSegment(seg.clientId, { depthMm: parseOptionalDim(e.target.value) })}
                        className={inputClass}
                      />
                    ) : (
                      <span className="tabular-nums">{seg.depthMm ?? "—"}</span>
                    )}
                  </td>
                  <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                    {canEditDims ? (
                      <input
                        type="number"
                        min={0}
                        max={MAX_RACK_DIM}
                        value={seg.heightMm ?? level.levelHeightMm ?? ""}
                        onChange={(e) => updateSegment(seg.clientId, { heightMm: parseOptionalDim(e.target.value) })}
                        className={inputClass}
                      />
                    ) : (
                      <span className="tabular-nums">{seg.heightMm ?? level.levelHeightMm ?? "—"}</span>
                    )}
                  </td>
                  <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                    {canEditDims ? (
                      <input
                        type="text"
                        value={seg.slotLabel}
                        onChange={(e) => updateSegment(seg.clientId, { slotLabel: e.target.value })}
                        placeholder="auto"
                        className={`${inputClass} font-mono`}
                      />
                    ) : (
                      <span className="font-mono">{seg.slotLabel.trim() || "—"}</span>
                    )}
                  </td>
                  {canEditStructure ? (
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-0.5">
                        <button
                          type="button"
                          title="Duplikuj segment"
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 hover:border-violet-300"
                          onClick={() => onChange(duplicateSegment(draft, bay.clientId, level.clientId, seg.clientId))}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        {level.segments.length > 1 ? (
                          <button
                            type="button"
                            title="Usuń segment"
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-200 text-red-700 hover:bg-red-50"
                            onClick={() => onChange(removeSegment(draft, bay.clientId, level.clientId, seg.clientId))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEditStructure ? (
        <div className="border-t border-slate-100 px-3 py-2">
          <button
            type="button"
            onClick={() => onChange(addSegment(draft, bay.clientId, level.clientId))}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 text-xs font-medium text-violet-900 hover:bg-violet-50/60"
          >
            <Plus className="h-3.5 w-3.5" />
            Dodaj segment
          </button>
        </div>
      ) : null}

      {!readOnly ? (
        <p className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-500">
          Pojemność liczona per segment (SZ × GŁ × WYS). Kliknij wiersz, aby podświetlić w podglądzie.
        </p>
      ) : null}
    </section>
  );
}
