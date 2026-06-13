import { useEffect, useMemo, useRef, useState } from "react";

import { computeCapacityDm3, computeSlotLabel } from "./rackLayoutUtils";
import type { RackStructureDraft } from "./rackStructureModel";

const UPRIGHT = "#2563eb";
const SHELF = "#ea580c";
const CELL_STROKE = "#cbd5e1";

type Props = {
  draft: RackStructureDraft;
  className?: string;
  showOccupancy?: boolean;
  occupancyBySegmentId?: Map<number, { orderNumber?: string | null; tone?: string }>;
};

export default function ConsolidationRackStructurePreview({
  draft,
  className = "",
  showOccupancy = false,
  occupancyBySegmentId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(420);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 420;
      setContainerHeight(Math.max(240, h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => buildLayout(draft, containerHeight), [draft, containerHeight]);

  if (draft.levels.length === 0) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
        Dodaj poziom regału.
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <h4 className="shrink-0 px-1 pb-2 text-sm font-bold text-slate-600">Podgląd regału — na żywo</h4>
      <div
        ref={containerRef}
        className="min-h-[280px] flex-1 overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50/30"
      >
        <svg
          viewBox={`0 0 ${layout.viewBoxW} ${layout.viewBoxH}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
        >
          <rect x={layout.margin} y={layout.margin} width={layout.beamW} height={layout.uprightH} fill={UPRIGHT} rx={2} />
          <rect
            x={layout.margin + layout.beamW + layout.contentW}
            y={layout.margin}
            width={layout.beamW}
            height={layout.uprightH}
            fill={UPRIGHT}
            rx={2}
          />
          {layout.shelfLines.map((y, i) => (
            <line
              key={`shelf-${i}`}
              x1={layout.ox}
              y1={y}
              x2={layout.ox + layout.contentW}
              y2={y}
              stroke={SHELF}
              strokeWidth={2}
              strokeOpacity={0.5}
            />
          ))}
          {layout.cells.map((cell) => {
            const occ = cell.segmentId != null ? occupancyBySegmentId?.get(cell.segmentId) : undefined;
            const fill = occ?.tone ?? "#ecfdf5";
            const stroke = occ ? "#059669" : CELL_STROKE;
            return (
              <g key={cell.key}>
                <rect
                  x={cell.x}
                  y={cell.y}
                  width={cell.w}
                  height={cell.h}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={1.5}
                  rx={3}
                />
                <text
                  x={cell.x + cell.w / 2}
                  y={cell.y + cell.h / 2 - (cell.capacity ? 8 : 0)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-slate-900"
                  fontSize={Math.min(22, Math.max(11, cell.w / 8))}
                  fontWeight={700}
                  fontFamily="ui-monospace, monospace"
                >
                  {cell.label}
                </text>
                {cell.capacity != null ? (
                  <text
                    x={cell.x + cell.w / 2}
                    y={cell.y + cell.h / 2 + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#64748b"
                    fontFamily="ui-monospace, monospace"
                  >
                    {cell.capacity.toFixed(0)} dm³
                  </text>
                ) : null}
                {showOccupancy && occ?.orderNumber ? (
                  <text
                    x={cell.x + cell.w / 2}
                    y={cell.y + cell.h - 8}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#334155"
                    fontWeight={600}
                  >
                    {occ.orderNumber}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 shrink-0 px-1 text-[11px] text-slate-500">
        Szerokości segmentów i wysokości poziomów odzwierciedlają wymiary mm. Suma szerokości w poziomie powinna
        odpowiadać szerokości regału ({draft.totalWidthMm ?? "—"} mm).
      </p>
    </div>
  );
}

function buildLayout(draft: RackStructureDraft, containerHeight: number) {
  const margin = 12;
  const beamW = 10;
  const viewBoxW = 1000;
  const viewBoxH = containerHeight;
  const contentW = viewBoxW - 2 * margin - 2 * beamW;
  const ox = margin + beamW;

  const levels = draft.levels;
  const levelHeightsMm = levels.map((lv) => {
    const fromSegs = lv.segments.map((s) => s.heightMm ?? lv.levelHeightMm ?? 500);
    return Math.max(1, ...fromSegs.map((h) => h ?? 500));
  });
  const totalH = levelHeightsMm.reduce((a, b) => a + b, 0);
  const contentAreaH = viewBoxH - 2 * margin;

  let yCursor = margin + contentAreaH;
  const cells: Array<{
    key: string;
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    capacity: number | null;
    segmentId?: number;
  }> = [];
  const shelfLines: number[] = [];

  levels.forEach((lv, li) => {
    const bandH = (levelHeightsMm[li]! / totalH) * contentAreaH;
    yCursor -= bandH;
    const levelName = lv.name.trim() || String.fromCharCode(65 + li);
    const isSegmented = lv.segments.length > 1;
    const widthSum = lv.segments.reduce((s, seg) => s + Math.max(1, seg.widthMm ?? 1), 0);
    let xCursor = ox;

    lv.segments.forEach((seg, si) => {
      const segW = ((seg.widthMm ?? 1) / widthSum) * contentW;
      const slot = computeSlotLabel(levelName, li, si, isSegmented, seg.slotLabel || null);
      const cap = computeCapacityDm3(seg.depthMm, seg.widthMm, seg.heightMm ?? lv.levelHeightMm);
      cells.push({
        key: seg.clientId,
        x: xCursor,
        y: yCursor,
        w: segW,
        h: bandH,
        label: slot,
        capacity: cap,
        segmentId: seg.segmentId,
      });
      xCursor += segW;
    });

    if (li > 0) shelfLines.push(yCursor);
  });

  const uprightH = contentAreaH;
  return { viewBoxW, viewBoxH, margin, beamW, contentW, ox, uprightH, shelfLines, cells };
}
