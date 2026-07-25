/**
 * Compact width miniature for template passage start/width (along rack width).
 * Full passage info lives in the main rack preview — this strip does not show height or levels.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { TemplatePassageDefault } from "../../types/warehouse";
import { snapCm } from "./warehouseUtils";

export type TemplatePassageOverlayProps = {
  width_cm: number;
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
  passages,
  selectedIndex,
  onSelectIndex,
  onChangePassages,
  className = "",
}: TemplatePassageOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 320, h: 72 });
  const dragRef = useRef<DragState | null>(null);
  const passagesRef = useRef(passages);
  passagesRef.current = passages;

  const alongCm = Math.max(1, snapCm(width_cm));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setBox({ w: Math.max(120, cr.width), h: Math.max(56, cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padX = 12;
  const padY = 18;
  const scale = (box.w - padX * 2) / alongCm;
  const drawW = alongCm * scale;
  const drawH = Math.max(28, box.h - padY * 2);
  const ox = padX;
  const oy = (box.h - drawH) / 2;

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

  if (passages.length === 0) {
    return (
      <div className={`flex flex-col min-h-0 ${className}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
          Miniatura — początek / szerokość
        </p>
        <p className="text-[11px] text-slate-400 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center">
          Dodaj przejazd, aby ustawić początek i szerokość wzdłuż regału.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="shrink-0 flex items-center justify-between gap-2 mb-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Miniatura — początek / szerokość
        </p>
        {activeClamped ? (
          <p className="text-[11px] text-slate-500 tabular-nums">
            {Math.round(activeClamped.offset_along_cm)} →{" "}
            {Math.round(activeClamped.offset_along_cm + activeClamped.width_cm)} cm
            <span className="text-slate-400"> · </span>
            {Math.round(activeClamped.width_cm)} cm
          </p>
        ) : null}
      </div>
      <div
        ref={containerRef}
        className="relative h-[72px] min-h-[72px] w-full rounded-xl border border-slate-200/70 bg-slate-50/80 overflow-hidden touch-none"
        onPointerDown={() => onSelectIndex(null)}
      >
        <svg width={box.w} height={box.h} className="block w-full h-full">
          <rect
            x={ox}
            y={oy}
            width={drawW}
            height={drawH}
            rx={4}
            fill="#e2e8f0"
            stroke="#94a3b8"
            strokeWidth={1.25}
          />
          <text x={ox} y={oy + drawH + 12} textAnchor="start" fontSize={9} fill="#64748b">
            0
          </text>
          <text x={ox + drawW} y={oy + drawH + 12} textAnchor="end" fontSize={9} fill="#64748b">
            {Math.round(alongCm)} cm
          </text>
          {passages.map((p, idx) => {
            if (p.enabled === false) return null;
            const clamped = clampTemplatePassage(alongCm, p.offset_along_cm, p.width_cm);
            const x = ox + (clamped.offset_along_cm / alongCm) * drawW;
            const w = Math.max(4, (clamped.width_cm / alongCm) * drawW);
            const selected = selectedIndex === idx || (selectedIndex == null && idx === 0);
            return (
              <g key={`pass-${idx}`} onPointerDown={(e) => startDrag(idx, "move", e)}>
                <rect
                  x={x}
                  y={oy + 2}
                  width={w}
                  height={drawH - 4}
                  fill={selected ? "rgba(8,145,178,0.35)" : "rgba(100,116,139,0.25)"}
                  stroke={selected ? "#0891b2" : "#64748b"}
                  strokeWidth={selected ? 2 : 1.25}
                  rx={3}
                  style={{ cursor: "grab" }}
                />
                <rect
                  x={x - 3}
                  y={oy}
                  width={6}
                  height={drawH}
                  fill="transparent"
                  style={{ cursor: "ew-resize" }}
                  onPointerDown={(e) => startDrag(idx, "resize-start", e)}
                />
                <rect
                  x={x + w - 3}
                  y={oy}
                  width={6}
                  height={drawH}
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
