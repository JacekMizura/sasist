import { useMemo, useState } from "react";
import type { LocationVisualRackGridCell } from "../../../api/wmsLocationVisualApi";

const ZONE_TINT: Record<string, { fill: string; stroke: string; label: string }> = {
  A1: { fill: "rgba(59,130,246,0.08)", stroke: "rgba(59,130,246,0.25)", label: "Strefa A1" },
  B1: { fill: "rgba(34,197,94,0.08)", stroke: "rgba(34,197,94,0.25)", label: "Strefa B1" },
  C1: { fill: "rgba(234,179,8,0.08)", stroke: "rgba(234,179,8,0.25)", label: "Strefa C1" },
};

type TooltipState = {
  x: number;
  y: number;
  title: string;
  detail: string;
};

type Props = {
  cells: LocationVisualRackGridCell[];
  warehouseName?: string;
  focusedRackId?: number | null;
  onRackFocus?: (rackId: number) => void;
  activeOccupancy?: { sku: number; qty: number; percent: number };
  className?: string;
};

function zoneStyle(code: string) {
  const key = (code || "").trim().toUpperCase();
  return ZONE_TINT[key] || { fill: "rgba(100,116,139,0.06)", stroke: "rgba(100,116,139,0.2)", label: `Strefa ${code || "?"}` };
}

export function LocationPreviewWarehouseGrid({
  cells,
  warehouseName,
  focusedRackId,
  onRackFocus,
  activeOccupancy,
  className = "",
}: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const layout = useMemo(() => {
    if (!cells.length) return null;

    const pad = 0.04;
    const minX = Math.min(...cells.map((c) => c.x)) - pad;
    const minY = Math.min(...cells.map((c) => c.y)) - pad;
    const maxX = Math.max(...cells.map((c) => c.x + c.width)) + pad;
    const maxY = Math.max(...cells.map((c) => c.y + c.height)) + pad;
    const w = maxX - minX;
    const h = maxY - minY;

    const zones = new Map<string, LocationVisualRackGridCell[]>();
    for (const c of cells) {
      const z = (c.zone_code || "Inna").trim();
      const list = zones.get(z) || [];
      list.push(c);
      zones.set(z, list);
    }

    const zoneBoxes = Array.from(zones.entries()).map(([code, rackCells]) => {
      const zx = Math.min(...rackCells.map((c) => c.x));
      const zy = Math.min(...rackCells.map((c) => c.y));
      const zx2 = Math.max(...rackCells.map((c) => c.x + c.width));
      const zy2 = Math.max(...rackCells.map((c) => c.y + c.height));
      return { code, x: zx, y: zy, width: zx2 - zx, height: zy2 - zy };
    });

    const activeId = cells.find((c) => c.is_active)?.id ?? cells[0]?.id ?? null;
    const focusId = focusedRackId ?? activeId;

    return { minX, minY, w, h, zoneBoxes, focusId, activeId };
  }, [cells, focusedRackId]);

  if (!cells.length || !layout) {
    return (
      <div
        className={`flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-[#eef1f5] text-sm text-slate-500 ${className}`}
      >
        Brak planu magazynu dla tej lokalizacji.
      </div>
    );
  }

  const toSvg = (x: number, y: number) => ({
    x: ((x - layout.minX) / layout.w) * 1000,
    y: ((y - layout.minY) / layout.h) * 620,
  });

  const scaleMeters = Math.max(1, Math.round(layout.w * 12));

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-300/70 bg-[#dfe4ea] shadow-inner ${className}`}
      onMouseLeave={() => setTooltip(null)}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-300/50 bg-[#d5dbe3]/90 px-3 py-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Plan magazynu</p>
          <p className="text-xs font-semibold text-slate-800">{warehouseName || "Magazyn"}</p>
        </div>
        <div className="text-right text-[10px] font-medium text-slate-600">
          <p>Skala orientacyjna</p>
          <p className="font-mono text-slate-800">~{scaleMeters} m × {Math.max(1, Math.round(layout.h * 12))} m</p>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-[#e8ecf1]">
        <svg viewBox="0 0 1000 620" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id="wh-floor-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#cbd5e1" strokeWidth="0.6" opacity="0.45" />
            </pattern>
            <filter id="rack-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#2563eb" floodOpacity="0.55" />
              <feDropShadow dx="0" dy="0" stdDeviation="14" floodColor="#38bdf8" floodOpacity="0.35" />
            </filter>
            <linearGradient id="aisle-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>
            <linearGradient id="rack-top" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width="1000" height="620" fill="url(#wh-floor-grid)" />

          {/* Alejki — poziome i pionowe przejścia */}
          {[0.18, 0.52, 0.82].map((frac) => (
            <rect
              key={`aisle-h-${frac}`}
              x={40}
              y={620 * frac - 14}
              width={920}
              height={28}
              rx={6}
              fill="url(#aisle-fill)"
              stroke="#cbd5e1"
              strokeWidth="1"
              opacity="0.95"
            />
          ))}
          {[0.22, 0.55, 0.78].map((frac) => (
            <rect
              key={`aisle-v-${frac}`}
              x={1000 * frac - 12}
              y={30}
              width={24}
              height={560}
              rx={6}
              fill="url(#aisle-fill)"
              stroke="#cbd5e1"
              strokeWidth="1"
              opacity="0.9"
            />
          ))}

          {/* Strefy */}
          {layout.zoneBoxes.map((zone) => {
            const p = toSvg(zone.x - 0.012, zone.y - 0.012);
            const pw = (zone.width + 0.024) / layout.w * 1000;
            const ph = (zone.height + 0.024) / layout.h * 620;
            const st = zoneStyle(zone.code);
            return (
              <g key={`zone-${zone.code}`}>
                <rect
                  x={p.x}
                  y={p.y}
                  width={pw}
                  height={ph}
                  rx={10}
                  fill={st.fill}
                  stroke={st.stroke}
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                />
                <text
                  x={p.x + 10}
                  y={p.y + 18}
                  fill="#475569"
                  fontSize="11"
                  fontWeight="700"
                  letterSpacing="0.06em"
                >
                  {st.label}
                </text>
              </g>
            );
          })}

          {/* Regały */}
          {cells.map((cell) => {
            const p = toSvg(cell.x, cell.y);
            const pw = (cell.width / layout.w) * 1000;
            const ph = (cell.height / layout.h) * 620;
            const isActive = cell.is_active;
            const isFocused = layout.focusId === cell.id;
            const depth = Math.min(8, pw * 0.06);

            return (
              <g
                key={cell.id}
                className="cursor-pointer transition-opacity hover:opacity-95"
                onClick={() => onRackFocus?.(cell.id)}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement | null)?.getBoundingClientRect();
                  if (!rect) return;
                  const occ =
                    isActive && activeOccupancy
                      ? `Zajętość ${Math.round(activeOccupancy.percent)}% · SKU ${activeOccupancy.sku} · ${activeOccupancy.qty} szt.`
                      : "Kliknij, aby skupić widok regału";
                  setTooltip({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    title: cell.name || `Regał #${cell.id}`,
                    detail: occ,
                  });
                }}
                onMouseMove={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement | null)?.getBoundingClientRect();
                  if (!rect) return;
                  setTooltip((prev) =>
                    prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : prev,
                  );
                }}
              >
                {/* cień / głębia */}
                <rect
                  x={p.x + depth}
                  y={p.y + depth}
                  width={pw}
                  height={ph}
                  rx={4}
                  fill="#334155"
                  opacity={0.35}
                />
                {/* korpus regału */}
                <rect
                  x={p.x}
                  y={p.y}
                  width={pw}
                  height={ph}
                  rx={4}
                  fill={isFocused ? "#1e40af" : "url(#rack-top)"}
                  stroke={isActive ? "#38bdf8" : isFocused ? "#60a5fa" : "#334155"}
                  strokeWidth={isActive ? 3 : isFocused ? 2.5 : 1.5}
                  filter={isActive ? "url(#rack-glow)" : undefined}
                  className={isActive ? "animate-[rackPulse_2s_ease-in-out_infinite]" : undefined}
                />
                {/* segmenty na regale (top-down) */}
                {Array.from({ length: Math.max(2, Math.min(4, Math.round(ph / 28))) }).map((_, i, arr) => (
                  <line
                    key={`seg-${cell.id}-${i}`}
                    x1={p.x + 4}
                    x2={p.x + pw - 4}
                    y1={p.y + (ph / arr.length) * (i + 1)}
                    y2={p.y + (ph / arr.length) * (i + 1)}
                    stroke="#94a3b8"
                    strokeWidth="0.8"
                    opacity="0.7"
                  />
                ))}
                <text
                  x={p.x + pw / 2}
                  y={p.y + ph / 2 + 4}
                  textAnchor="middle"
                  fill={isFocused ? "#eff6ff" : "#f8fafc"}
                  fontSize={Math.max(9, Math.min(13, pw / 8))}
                  fontWeight="800"
                >
                  {cell.name}
                </text>
                {isActive ? (
                  <g>
                    <rect
                      x={p.x + pw / 2 - 22}
                      y={p.y - 16}
                      width={44}
                      height={18}
                      rx={9}
                      fill="#2563eb"
                      stroke="#bfdbfe"
                      strokeWidth="1"
                    />
                    <text x={p.x + pw / 2} y={p.y - 3} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="800">
                      TU
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {/* Północ / orientacja */}
          <g transform="translate(920, 36)">
            <polygon points="0,0 -8,14 8,14" fill="#64748b" />
            <text x="0" y="28" textAnchor="middle" fill="#64748b" fontSize="10" fontWeight="700">
              N
            </text>
          </g>

          {/* Skala */}
          <g transform="translate(24, 580)">
            <line x1="0" y1="0" x2="80" y2="0" stroke="#475569" strokeWidth="2" />
            <line x1="0" y1="-4" x2="0" y2="4" stroke="#475569" strokeWidth="2" />
            <line x1="80" y1="-4" x2="80" y2="4" stroke="#475569" strokeWidth="2" />
            <text x="40" y="14" textAnchor="middle" fill="#475569" fontSize="9" fontWeight="600">
              ~10 m
            </text>
          </g>
        </svg>

        {tooltip ? (
          <div
            className="pointer-events-none absolute z-10 max-w-[220px] rounded-lg border border-slate-200 bg-white/95 px-2.5 py-2 text-xs shadow-lg backdrop-blur-sm"
            style={{ left: Math.min(tooltip.x + 12, 280), top: Math.max(8, tooltip.y - 8) }}
          >
            <p className="font-bold text-slate-900">{tooltip.title}</p>
            <p className="mt-0.5 text-slate-600">{tooltip.detail}</p>
          </div>
        ) : null}
      </div>

      <style>{`
        @keyframes rackPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.88; }
        }
      `}</style>
    </div>
  );
}
