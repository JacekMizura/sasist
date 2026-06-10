import type { LocationVisualRackGridCell } from "../../../api/wmsLocationVisualApi";

const ZONE_COLORS: Record<string, string> = {
  A1: "#3b82f6",
  B1: "#22c55e",
  C1: "#eab308",
};

function cellFill(cell: LocationVisualRackGridCell): string {
  if (cell.is_active) return "#2563eb";
  const z = (cell.zone_code || "").trim().toUpperCase();
  if (ZONE_COLORS[z]) return ZONE_COLORS[z];
  if (cell.color) return cell.color;
  return "#94a3b8";
}

type Props = {
  cells: LocationVisualRackGridCell[];
  className?: string;
};

export function LocationPreviewWarehouseGrid({ cells, className = "" }: Props) {
  if (!cells.length) {
    return (
      <div className={`rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 ${className}`}>
        Brak planu regałów dla tej lokalizacji.
      </div>
    );
  }

  const zones = Array.from(new Set(cells.map((c) => (c.zone_code || "Inna").trim()).filter(Boolean)));

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Mapa magazynu</p>
        <div className="flex flex-wrap gap-2">
          {zones.slice(0, 4).map((z) => (
            <span key={z} className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: ZONE_COLORS[z.toUpperCase()] || "#94a3b8" }}
              />
              Strefa {z}
            </span>
          ))}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
        <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" className="aspect-[16/10] w-full">
          {cells.map((cell) => (
            <rect
              key={cell.id}
              x={cell.x}
              y={cell.y}
              width={cell.width}
              height={cell.height}
              rx={0.008}
              fill={cellFill(cell)}
              stroke={cell.is_active ? "#1d4ed8" : "#64748b"}
              strokeWidth={cell.is_active ? 0.012 : 0.004}
              className={cell.is_active ? "animate-pulse" : undefined}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">
            Podświetlony regał = Twoja lokalizacja
          </span>
        </div>
      </div>
    </div>
  );
}
