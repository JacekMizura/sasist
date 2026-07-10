import { memo } from "react";

const HEATMAP_ORDER = ["AX", "AY", "AZ", "BX", "BY", "BZ", "CX", "CY", "CZ"] as const;

type Props = {
  counts: Record<string, number>;
  activeSegment: string;
  onSelect: (segment: string) => void;
};

function PlanSegmentHeatmapInner({ counts, activeSegment, onSelect }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Segmenty ABC/XYZ</p>
      <div className="grid grid-cols-3 gap-1">
        {HEATMAP_ORDER.map((seg) => {
          const active = activeSegment.toUpperCase() === seg;
          const count = counts[seg] ?? 0;
          return (
            <button
              key={seg}
              type="button"
              onClick={() => onSelect(active ? "" : seg)}
              className={`rounded-md border px-1 py-1.5 text-center transition ${
                active
                  ? "border-orange-500 bg-orange-50 ring-1 ring-orange-300"
                  : "border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white"
              }`}
              title={`Filtruj segment ${seg}`}
            >
              <div className="font-mono text-[11px] font-bold text-slate-900">{seg}</div>
              <div className="text-[10px] tabular-nums text-slate-600">{count}</div>
            </button>
          );
        })}
      </div>
      {activeSegment ? (
        <button type="button" className="mt-2 text-xs text-sky-700 underline" onClick={() => onSelect("")}>
          Wyczyść filtr segmentu ({activeSegment})
        </button>
      ) : null}
    </div>
  );
}

export const PlanSegmentHeatmap = memo(PlanSegmentHeatmapInner);
