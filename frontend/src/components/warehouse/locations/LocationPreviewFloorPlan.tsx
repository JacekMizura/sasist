import { useMemo } from "react";
import type { LayoutState, RackState } from "../../../types/warehouse";
import { getRackDisplayId } from "../warehouseUtils";

type Props = {
  layout: LayoutState;
  activeRackId?: number | null;
  activeAisleLetter?: string | null;
  activeLocationUuid?: string | null;
  className?: string;
};

function rackLabel(rack: RackState, layout: LayoutState): string {
  const id = getRackDisplayId(rack, layout).trim();
  if (id) return id;
  return (rack.name ?? "").trim() || `R${rack.id}`;
}

function rackHasLocation(rack: RackState, uuid: string): boolean {
  const u = uuid.trim();
  if (!u) return false;
  return (rack.bins ?? []).some((b) => (b.locationUUID ?? "").trim() === u);
}

export function LocationPreviewFloorPlan({
  layout,
  activeRackId,
  activeAisleLetter,
  activeLocationUuid,
  className = "",
}: Props) {
  const racks = layout.racks ?? [];
  const uuid = (activeLocationUuid ?? "").trim();
  const aisle = (activeAisleLetter ?? "").trim().toUpperCase();

  const view = useMemo(() => {
    if (racks.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of racks) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + Math.max(1, r.width));
      maxY = Math.max(maxY, r.y + Math.max(1, r.height));
    }
    const pad = 1.2;
    return {
      minX: minX - pad,
      minY: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };
  }, [racks]);

  if (!view || racks.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 ${className}`}
      >
        Brak regałów na planie magazynu.
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      <div className="shrink-0 border-b border-slate-100 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Plan hali</p>
        <p className="text-xs text-slate-600">Regał, alejka i lokalizacja podświetlone</p>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-white p-3">
        <svg
          viewBox={`${view.minX} ${view.minY} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full select-none"
          role="img"
          aria-label="Plan magazynu — widok z góry"
        >
          {racks.map((rack) => {
            const label = rackLabel(rack, layout);
            const isFocused = activeRackId != null && rack.id === activeRackId;
            const hasActiveBin = uuid.length > 0 && rackHasLocation(rack, uuid);
            const rackAisle = String(rack.aisle_letter ?? "").trim().toUpperCase();
            const sameAisle = Boolean(aisle) && rackAisle === aisle;
            const isHighlighted = isFocused || hasActiveBin;
            const cx = rack.x + rack.width / 2;
            const cy = rack.y + rack.height / 2;
            const fontSize = Math.min(rack.width, rack.height) * 0.38;

            let fill = "#ffffff";
            let stroke = "#e2e8f0";
            let strokeWidth = 0.08;
            let textFill = "#475569";
            if (sameAisle && !isHighlighted) {
              fill = "#fef3c7";
              stroke = "#f59e0b";
              strokeWidth = 0.1;
              textFill = "#92400e";
            }
            if (isHighlighted) {
              fill = "#dbeafe";
              stroke = "#2563eb";
              strokeWidth = 0.14;
              textFill = "#1e3a8a";
            }
            if (hasActiveBin) {
              stroke = "#1d4ed8";
              strokeWidth = 0.16;
            }

            return (
              <g key={rack.id}>
                {sameAisle ? (
                  <rect
                    x={rack.x - 0.12}
                    y={rack.y - 0.12}
                    width={Math.max(0.5, rack.width + 0.24)}
                    height={Math.max(0.5, rack.height + 0.24)}
                    rx={0.28}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={0.08}
                    strokeDasharray="0.2 0.12"
                    opacity={0.9}
                  />
                ) : null}
                <rect
                  x={rack.x + 0.06}
                  y={rack.y + 0.06}
                  width={Math.max(0.5, rack.width - 0.12)}
                  height={Math.max(0.5, rack.height - 0.12)}
                  rx={0.18}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                />
                {hasActiveBin ? (
                  <circle
                    cx={cx}
                    cy={cy + Math.min(rack.height, rack.width) * 0.28}
                    r={Math.min(rack.width, rack.height) * 0.08}
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth={0.04}
                  />
                ) : null}
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontSize}
                  fontWeight={isHighlighted ? 700 : 600}
                  fill={textFill}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-200 ring-1 ring-blue-600" /> Regał
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-100 ring-1 ring-amber-400" /> Alejka
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Lokalizacja
        </span>
      </div>
    </div>
  );
}
