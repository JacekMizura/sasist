import { useId, useMemo, useState } from "react";
import type { LocationVisualRackGridCell } from "../../../api/wmsLocationVisualApi";
import { WarehouseRackTopDown } from "./WarehouseRackTopDown";
import {
  computeFloorLayout,
  toFloorSvg,
  toFloorSvgSize,
  zoneMeta,
} from "./warehouseFloorPlanUtils";

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

function AisleArrows({
  uid,
  x,
  y,
  width,
  height,
  orientation,
}: {
  uid: string;
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: "h" | "v";
}) {
  const count = orientation === "h" ? Math.max(2, Math.floor(width / 120)) : Math.max(2, Math.floor(height / 100));
  const items = Array.from({ length: count });
  return (
    <g opacity="0.55">
      {items.map((_, i) => {
        const t = (i + 0.5) / count;
        const cx = orientation === "h" ? x + width * t : x + width / 2;
        const cy = orientation === "h" ? y + height / 2 : y + height * t;
        const rot = orientation === "h" ? 0 : 90;
        return (
          <g key={`arr-${i}`} transform={`translate(${cx},${cy}) rotate(${rot})`}>
            <path d="M-5,0 L5,0 M2,-3 L5,0 L2,3" stroke={`url(#${uid}-aisle-arrow)`} strokeWidth="1.8" fill="none" />
          </g>
        );
      })}
    </g>
  );
}

export function LocationPreviewWarehouseGrid({
  cells,
  warehouseName,
  focusedRackId,
  onRackFocus,
  activeOccupancy,
  className = "",
}: Props) {
  const uid = useId().replace(/:/g, "");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const layout = useMemo(() => computeFloorLayout(cells, focusedRackId), [cells, focusedRackId]);

  if (!cells.length || !layout) {
    return (
      <div
        className={`flex h-full min-h-[220px] items-center justify-center bg-[#0c1018] text-sm text-slate-400 ${className}`}
      >
        Brak planu magazynu dla tej lokalizacji.
      </div>
    );
  }

  const { bounds, zoneBoxes, aisles } = layout;
  const scaleM = Math.max(1, Math.round(bounds.w * 14));
  const scaleH = Math.max(1, Math.round(bounds.h * 14));

  const svgX = (nx: number) => toFloorSvg(nx, 0, bounds).x;
  const svgY = (ny: number) => toFloorSvg(0, ny, bounds).y;
  const svgW = (nw: number) => toFloorSvgSize(nw, bounds, "x");
  const svgH = (nh: number) => toFloorSvgSize(nh, bounds, "y");

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col overflow-hidden bg-[#080c12] ${className}`}
      onMouseLeave={() => setTooltip(null)}
    >
      {/* HUD */}
      <div className="absolute left-3 top-3 z-20 flex items-start gap-3">
        <div className="rounded-md border border-cyan-500/20 bg-[#0f1520]/90 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-400/80">Digital twin · top view</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-100">{warehouseName || "Magazyn"}</p>
        </div>
        <div className="rounded-md border border-slate-600/30 bg-[#0f1520]/75 px-2.5 py-2 backdrop-blur-md">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Skala hali</p>
          <p className="font-mono text-xs font-semibold text-slate-300">
            {scaleM}×{scaleH} m
          </p>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <svg viewBox="0 0 1000 640" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id={`${uid}-floor-vignette`} cx="50%" cy="45%" r="70%">
              <stop offset="0%" stopColor="#141c28" />
              <stop offset="100%" stopColor="#080c12" />
            </radialGradient>
            <pattern id={`${uid}-floor-fine`} width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M8 0 L0 0 0 8" fill="none" stroke="#1e293b" strokeWidth="0.35" opacity="0.5" />
            </pattern>
            <pattern id={`${uid}-floor-coarse`} width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="none" stroke="#243044" strokeWidth="0.6" opacity="0.35" />
            </pattern>
            <linearGradient id={`${uid}-aisle-surface`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a2230" />
              <stop offset="50%" stopColor="#222b3a" />
              <stop offset="100%" stopColor="#161d28" />
            </linearGradient>
            <linearGradient id={`${uid}-aisle-arrow`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id={`${uid}-rack-surface`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2a3548" />
              <stop offset="40%" stopColor="#1e2836" />
              <stop offset="100%" stopColor="#151c26" />
            </linearGradient>
            <linearGradient id={`${uid}-upright`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="50%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
            <filter id={`${uid}-shadow-blur`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <filter id={`${uid}-active-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={`${uid}-beacon-glow`} x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#38bdf8" floodOpacity="0.9" />
            </filter>
            <filter id="wh-floor-noise" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" result="n" />
              <feColorMatrix type="saturate" values="0" in="n" result="gn" />
              <feBlend in="SourceGraphic" in2="gn" mode="multiply" />
            </filter>
          </defs>

          {/* Posadzka hali */}
          <rect x="0" y="0" width="1000" height="640" fill={`url(#${uid}-floor-vignette)`} />
          <rect x="0" y="0" width="1000" height="640" fill={`url(#${uid}-floor-coarse)`} />
          <rect x="0" y="0" width="1000" height="640" fill={`url(#${uid}-floor-fine)`} opacity="0.65" />

          {/* Strefy — wash na posadzce */}
          {zoneBoxes.map((zone) => {
            const p = toFloorSvg(zone.x, zone.y, bounds);
            const pw = svgW(zone.width);
            const ph = svgH(zone.height);
            const meta = zoneMeta(zone.code);
            return (
              <g key={`zone-${zone.code}`}>
                <rect x={p.x} y={p.y} width={pw} height={ph} fill={meta.floorTint} />
                <rect
                  x={p.x}
                  y={p.y}
                  width={pw}
                  height={ph}
                  fill="none"
                  stroke={meta.accent}
                  strokeWidth="0.8"
                  opacity="0.22"
                />
                <text
                  x={p.x + 12}
                  y={p.y + 20}
                  fill={meta.accent}
                  fontSize="11"
                  fontWeight="700"
                  letterSpacing="0.14em"
                  opacity="0.75"
                >
                  {meta.label.toUpperCase()}
                </text>
                <text x={p.x + 12} y={p.y + 34} fill="#64748b" fontSize="9" fontWeight="600" opacity="0.7">
                  {zone.code}
                </text>
              </g>
            );
          })}

          {/* Alejki — wyliczone z rozmieszczenia regałów */}
          {aisles.map((aisle) => {
            const ax = svgX(aisle.x);
            const ay = svgY(aisle.y);
            const aw = svgW(aisle.width);
            const ah = svgH(aisle.height);
            const isWide = aisle.orientation === "h" ? ah : aw;
            return (
              <g key={`aisle-${aisle.label}-${ax}-${ay}`}>
                <rect x={ax} y={ay} width={aw} height={ah} fill={`url(#${uid}-aisle-surface)`} />
                {/* krawędzie jezdni */}
                <line
                  x1={ax}
                  y1={ay + (aisle.orientation === "h" ? 1 : 0)}
                  x2={ax + (aisle.orientation === "h" ? aw : 0)}
                  y2={ay + (aisle.orientation === "h" ? 1 : ah)}
                  stroke="#64748b"
                  strokeWidth="1"
                  opacity="0.35"
                />
                <line
                  x1={ax + (aisle.orientation === "h" ? 0 : aw - 1)}
                  y1={ay + (aisle.orientation === "h" ? ah - 1 : 0)}
                  x2={ax + aw}
                  y2={ay + ah}
                  stroke="#64748b"
                  strokeWidth="1"
                  opacity="0.35"
                />
                {/* pas ruchu */}
                {aisle.orientation === "h" ? (
                  <line
                    x1={ax + 16}
                    y1={ay + ah / 2}
                    x2={ax + aw - 16}
                    y2={ay + ah / 2}
                    stroke="#fbbf24"
                    strokeWidth="1.2"
                    strokeDasharray="10 8"
                    opacity="0.55"
                  />
                ) : (
                  <line
                    x1={ax + aw / 2}
                    y1={ay + 16}
                    x2={ax + aw / 2}
                    y2={ay + ah - 16}
                    stroke="#fbbf24"
                    strokeWidth="1.2"
                    strokeDasharray="10 8"
                    opacity="0.55"
                  />
                )}
                <AisleArrows uid={uid} x={ax} y={ay} width={aw} height={ah} orientation={aisle.orientation} />
                {aisle.label && isWide > 18 ? (
                  <text
                    x={ax + (aisle.orientation === "h" ? 8 : aw / 2)}
                    y={ay + (aisle.orientation === "h" ? ah / 2 + 4 : 14)}
                    fill="#94a3b8"
                    fontSize="8"
                    fontWeight="700"
                    letterSpacing="0.08em"
                    transform={aisle.orientation === "v" ? `rotate(-90 ${ax + aw / 2} ${ay + 14})` : undefined}
                    opacity="0.65"
                  >
                    {aisle.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* Regały */}
          {cells.map((cell) => {
            const p = toFloorSvg(cell.x, cell.y, bounds);
            const pw = svgW(cell.width);
            const ph = svgH(cell.height);
            const isActive = cell.is_active;
            const isFocused = layout.focusId === cell.id;

            return (
              <WarehouseRackTopDown
                key={cell.id}
                cell={cell}
                x={p.x}
                y={p.y}
                width={pw}
                height={ph}
                isActive={isActive}
                isFocused={isFocused}
                uid={uid}
                onFocus={() => onRackFocus?.(cell.id)}
                onHover={(e) => {
                  const svg = e.currentTarget.ownerSVGElement;
                  const rect = svg?.getBoundingClientRect();
                  if (!rect) return;
                  const occ =
                    isActive && activeOccupancy
                      ? `${Math.round(activeOccupancy.percent)}% zajętości · ${activeOccupancy.sku} SKU · ${activeOccupancy.qty} szt.`
                      : "Kliknij, aby skupić widok regału";
                  setTooltip({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    title: cell.name || `Regał ${cell.id}`,
                    detail: occ,
                  });
                }}
                onHoverMove={(e) => {
                  const svg = e.currentTarget.ownerSVGElement;
                  const rect = svg?.getBoundingClientRect();
                  if (!rect) return;
                  setTooltip((prev) =>
                    prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : prev,
                  );
                }}
              />
            );
          })}

          {/* Kompas */}
          <g transform="translate(948, 48)">
            <circle r="16" fill="#0f1520" stroke="#334155" strokeWidth="1" opacity="0.9" />
            <polygon points="0,-10 -5,6 5,6" fill="#38bdf8" />
            <text y="24" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="700">
              N
            </text>
          </g>

          {/* Skala */}
          <g transform="translate(24, 608)">
            <rect x="-4" y="-10" width="108" height="22" rx="3" fill="#0f1520" opacity="0.85" />
            <line x1="0" y1="0" x2="80" y2="0" stroke="#94a3b8" strokeWidth="2" />
            <line x1="0" y1="-4" x2="0" y2="4" stroke="#94a3b8" strokeWidth="2" />
            <line x1="80" y1="-4" x2="80" y2="4" stroke="#94a3b8" strokeWidth="2" />
            <text x="40" y="-2" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="600">
              ~10 m
            </text>
          </g>
        </svg>

        {tooltip ? (
          <div
            className="pointer-events-none absolute z-30 max-w-[240px] rounded border border-cyan-500/25 bg-[#0f1520]/95 px-3 py-2 text-xs shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
            style={{ left: Math.min(tooltip.x + 14, 320), top: Math.max(12, tooltip.y - 10) }}
          >
            <p className="font-bold tracking-wide text-cyan-100">{tooltip.title}</p>
            <p className="mt-1 text-slate-400">{tooltip.detail}</p>
          </div>
        ) : null}
      </div>

      <style>{`
        @keyframes whPulseRing {
          0%, 100% { opacity: 0.35; stroke-width: 1.5; }
          50% { opacity: 0.75; stroke-width: 2.5; }
        }
        .wh-loc-pulse-ring-${uid} {
          animation: whPulseRing 2.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
