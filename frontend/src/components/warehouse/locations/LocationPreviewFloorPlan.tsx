import { useMemo } from "react";
import type { LayoutState, RackState } from "../../../types/warehouse";
import { getRackDisplayId } from "../warehouseUtils";

type Props = {
  layout: LayoutState;
  activeRackId?: number | null;
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
  activeLocationUuid,
  className = "",
}: Props) {
  const racks = layout.racks ?? [];
  const uuid = (activeLocationUuid ?? "").trim();

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
      <div className={`flex items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 ${className}`}>
        Brak regałów na planie magazynu.
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      <div className="shrink-0 border-b border-slate-100 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Plan hali</p>
        <p className="text-xs text-slate-600">Podgląd położenia regału w magazynie</p>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-white p-3">
        <svg
          viewBox={`${view.minX} ${view.minY} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          className="pointer-events-none h-full w-full select-none"
          role="img"
          aria-label="Plan magazynu — widok z góry, tylko do odczytu"
        >
          {racks.map((rack) => {
            const label = rackLabel(rack, layout);
            const isFocused = activeRackId != null && rack.id === activeRackId;
            const hasActiveBin = uuid.length > 0 && rackHasLocation(rack, uuid);
            const isHighlighted = isFocused || hasActiveBin;
            const cx = rack.x + rack.width / 2;
            const cy = rack.y + rack.height / 2;
            const fontSize = Math.min(rack.width, rack.height) * 0.38;
            return (
              <g key={rack.id} aria-hidden={!isHighlighted}>
                <rect
                  x={rack.x + 0.06}
                  y={rack.y + 0.06}
                  width={Math.max(0.5, rack.width - 0.12)}
                  height={Math.max(0.5, rack.height - 0.12)}
                  rx={0.18}
                  fill={isHighlighted ? "#f0f7ff" : "#ffffff"}
                  stroke={isHighlighted ? "#93c5fd" : "#e2e8f0"}
                  strokeWidth={isHighlighted ? 0.1 : 0.08}
                />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontSize}
                  fontWeight={isHighlighted ? 700 : 600}
                  fill={isHighlighted ? "#1e3a8a" : "#475569"}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
