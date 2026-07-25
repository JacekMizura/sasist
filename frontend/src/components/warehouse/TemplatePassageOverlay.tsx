/**
 * Front-elevation mini-CAD for template default passages (config only).
 * Horizontal axis = rack width (passage start/width).
 * Vertical axis = rack height (levels + clearance). Depth is never shown — passage always spans full depth.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { LevelConfigItem, TemplatePassageDefault } from "../../types/warehouse";
import { levelHeightsForRack, snapCm } from "./warehouseUtils";
import { countPassageVoidLevels, getPassageVoidHeightCm } from "./passageStorage";

export type TemplatePassageOverlayProps = {
  width_cm: number;
  height_cm: number;
  levels: number;
  levelConfig?: LevelConfigItem[];
  passages: TemplatePassageDefault[];
  selectedIndex: number | null;
  onSelectIndex: (index: number | null) => void;
  onChangePassages: (next: TemplatePassageDefault[]) => void;
  className?: string;
};

type DragMode = "move" | "resize-start" | "resize-end";

type DragState = {
  index: number;
  mode: DragMode;
  startClientX: number;
  originOffset: number;
  originWidth: number;
};

/** Clamp passage opening to rack width (along = width_cm). */
export function clampTemplatePassage(
  alongCm: number,
  offset: number,
  width: number
): { offset_along_cm: number; width_cm: number } {
  const along = Math.max(1, alongCm);
  let w = Math.max(1, Math.min(width, along));
  let o = Math.max(0, Math.min(offset, along - w));
  w = Math.max(1, Math.min(w, along - o));
  return { offset_along_cm: snapCm(o), width_cm: snapCm(w) };
}

/** Validation against rack width only (product rule). */
export function isPassageGeometryValid(
  rackWidthCm: number,
  offset: number,
  width: number
): boolean {
  const W = Math.max(1, rackWidthCm);
  if (!(offset >= 0)) return false;
  if (!(offset <= W)) return false;
  if (!(width > 0)) return false;
  if (!(offset + width <= W + 0.01)) return false;
  return true;
}

export function TemplatePassageOverlay({
  width_cm,
  height_cm,
  levels,
  levelConfig,
  passages,
  selectedIndex,
  onSelectIndex,
  onChangePassages,
  className = "",
}: TemplatePassageOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 320, h: 200 });
  const dragRef = useRef<DragState | null>(null);
  const passagesRef = useRef(passages);
  passagesRef.current = passages;

  const alongCm = Math.max(1, snapCm(width_cm));
  const rackH = Math.max(1, snapCm(height_cm));
  const structuralCount = Math.max(
    1,
    Array.isArray(levelConfig) && levelConfig.length > 0 ? levelConfig.length : Math.max(1, levels)
  );
  const levelHeights = levelHeightsForRack(rackH, structuralCount);
  const voidCount = countPassageVoidLevels(rackH, structuralCount, getPassageVoidHeightCm(passages));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setBox({ w: Math.max(120, cr.width), h: Math.max(100, cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padLeft = 36;
  const padRight = 12;
  const padTop = 16;
  const padBottom = 28;
  const scale = Math.min(
    (box.w - padLeft - padRight) / alongCm,
    (box.h - padTop - padBottom) / rackH
  );
  const drawW = alongCm * scale;
  const drawH = rackH * scale;
  const ox = padLeft;
  const oy = padTop + ((box.h - padTop - padBottom) - drawH) / 2;

  const clientToAlongCm = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left - ox;
      return Math.max(0, Math.min(alongCm, x / scale));
    },
    [alongCm, ox, scale]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const along = clientToAlongCm(e.clientX);
      const next = passagesRef.current.map((p, i) => {
        if (i !== drag.index) return p;
        if (drag.mode === "move") {
          const delta = along - clientToAlongCm(drag.startClientX);
          const clamped = clampTemplatePassage(alongCm, drag.originOffset + delta, drag.originWidth);
          return { ...p, ...clamped };
        }
        if (drag.mode === "resize-start") {
          const end = drag.originOffset + drag.originWidth;
          const newOffset = Math.max(0, Math.min(along, end - 1));
          return { ...p, ...clampTemplatePassage(alongCm, newOffset, end - newOffset) };
        }
        const newEnd = Math.max(drag.originOffset + 1, Math.min(along, alongCm));
        return { ...p, ...clampTemplatePassage(alongCm, drag.originOffset, newEnd - drag.originOffset) };
      });
      onChangePassages(next);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [alongCm, clientToAlongCm, onChangePassages]);

  const startDrag = (index: number, mode: DragMode, e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const p = passages[index];
    if (!p) return;
    onSelectIndex(index);
    dragRef.current = {
      index,
      mode,
      startClientX: e.clientX,
      originOffset: p.offset_along_cm,
      originWidth: p.width_cm,
    };
  };

  const active = selectedIndex != null ? passages[selectedIndex] : passages[0];
  const activeClamped = active
    ? clampTemplatePassage(alongCm, active.offset_along_cm, active.width_cm)
    : null;
  const clearanceCm = active?.enabled === false
    ? 0
    : Math.max(0, Number(active?.clearance_height_cm) || 0);

  // Level bottoms from floor (cm): level 0 starts at 0
  let bottomCm = 0;
  const levelBands: { lev: number; y0: number; y1: number; voided: boolean }[] = [];
  for (let lev = 0; lev < structuralCount; lev++) {
    const h = levelHeights[lev] ?? rackH / structuralCount;
    const y0 = oy + drawH - ((bottomCm + h) / rackH) * drawH;
    const y1 = oy + drawH - (bottomCm / rackH) * drawH;
    levelBands.push({ lev, y0, y1, voided: lev < voidCount });
    bottomCm += h;
  }

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="shrink-0 flex items-center justify-between gap-2 mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Przejazd — widok od przodu
        </p>
        <p className="text-[11px] text-slate-400">pełna głębokość · oś = szerokość regału</p>
      </div>
      {activeClamped ? (
        <div className="mb-1.5 grid grid-cols-3 gap-1.5 text-center text-[11px]">
          <div className="rounded-md border border-slate-200 bg-white px-1.5 py-1">
            <div className="text-[9px] uppercase tracking-wide text-slate-400">Początek</div>
            <div className="font-mono font-semibold text-slate-800">
              {Math.round(activeClamped.offset_along_cm)} cm
            </div>
          </div>
          <div className="rounded-md border border-cyan-200 bg-cyan-50 px-1.5 py-1">
            <div className="text-[9px] uppercase tracking-wide text-cyan-700">Szerokość</div>
            <div className="font-mono font-semibold text-cyan-900">
              {Math.round(activeClamped.width_cm)} cm
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-1.5 py-1">
            <div className="text-[9px] uppercase tracking-wide text-slate-400">Wolna wys.</div>
            <div className="font-mono font-semibold text-slate-800">{Math.round(clearanceCm)} cm</div>
          </div>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 min-w-0 rounded-xl border border-slate-200/70 bg-slate-50/80 overflow-hidden touch-none"
        onPointerDown={() => onSelectIndex(null)}
      >
        <svg width={box.w} height={box.h} className="block w-full h-full">
          <defs>
            <pattern id="template-front-passage-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="#94a3b8" strokeWidth="2" />
            </pattern>
          </defs>
          {/* Rack front silhouette */}
          <rect
            x={ox}
            y={oy}
            width={drawW}
            height={drawH}
            rx={3}
            fill="#f8fafc"
            stroke="#64748b"
            strokeWidth={1.5}
          />
          {/* Construction levels */}
          {levelBands.map((b) => (
            <g key={`lev-${b.lev}`}>
              <rect
                x={ox}
                y={b.y0}
                width={drawW}
                height={Math.max(1, b.y1 - b.y0)}
                fill={b.voided ? "url(#template-front-passage-hatch)" : "#eff6ff"}
                stroke="#cbd5e1"
                strokeWidth={0.75}
              />
              {b.voided ? (
                <text
                  x={ox + drawW / 2}
                  y={(b.y0 + b.y1) / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={Math.min(11, Math.max(8, (b.y1 - b.y0) * 0.45))}
                  fontWeight={700}
                  fill="#64748b"
                  letterSpacing="0.12em"
                >
                  PRZEJAZD
                </text>
              ) : (
                <text
                  x={ox + 4}
                  y={(b.y0 + b.y1) / 2}
                  dominantBaseline="middle"
                  fontSize={9}
                  fill="#64748b"
                >
                  P{b.lev + 1}
                </text>
              )}
            </g>
          ))}
          {/* Width axis labels */}
          <text x={ox} y={oy + drawH + 14} textAnchor="start" fontSize={9} fill="#64748b">
            0
          </text>
          <text x={ox + drawW} y={oy + drawH + 14} textAnchor="end" fontSize={9} fill="#64748b">
            {Math.round(alongCm)} cm
          </text>
          {/* Passage opening outline (along width × clearance height) */}
          {passages.map((p, idx) => {
            if (p.enabled === false) return null;
            const clamped = clampTemplatePassage(alongCm, p.offset_along_cm, p.width_cm);
            const clr = Math.max(0, Math.min(rackH, Number(p.clearance_height_cm) || 0));
            const x = ox + (clamped.offset_along_cm / alongCm) * drawW;
            const w = Math.max(2, (clamped.width_cm / alongCm) * drawW);
            const h = clr > 0 ? (clr / rackH) * drawH : Math.min(drawH * 0.15, 24);
            const y = oy + drawH - h;
            const selected = selectedIndex === idx || (selectedIndex == null && idx === 0);
            return (
              <g key={`pass-${idx}`} onPointerDown={(e) => startDrag(idx, "move", e)}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={selected ? "rgba(8,145,178,0.28)" : "rgba(100,116,139,0.18)"}
                  stroke={selected ? "#0891b2" : "#64748b"}
                  strokeWidth={selected ? 2 : 1.25}
                  strokeDasharray={clr > 0 ? undefined : "4 3"}
                  rx={2}
                  style={{ cursor: "grab" }}
                />
                {/* Resize handles */}
                <rect
                  x={x - 3}
                  y={y}
                  width={6}
                  height={h}
                  fill="transparent"
                  style={{ cursor: "ew-resize" }}
                  onPointerDown={(e) => startDrag(idx, "resize-start", e)}
                />
                <rect
                  x={x + w - 3}
                  y={y}
                  width={6}
                  height={h}
                  fill="transparent"
                  style={{ cursor: "ew-resize" }}
                  onPointerDown={(e) => startDrag(idx, "resize-end", e)}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
