/**
 * Top-down mini-CAD for template default passages (config only — not runtime SSOT).
 * Along-axis matches vertical rack placement: depth_cm (Y); opening spans full width_cm (X).
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { TemplatePassageDefault } from "../../types/warehouse";
import { snapCm } from "./warehouseUtils";

export type TemplatePassageOverlayProps = {
  width_cm: number;
  depth_cm: number;
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
  startClientY: number;
  originOffset: number;
  originWidth: number;
};

/** Exported for unit tests. Along = depth for vertical template placement. */
export function clampTemplatePassage(
  alongCm: number,
  offset: number,
  width: number
): { offset_along_cm: number; width_cm: number } {
  const along = Math.max(1, alongCm);
  let w = Math.max(10, Math.min(width, along));
  let o = Math.max(0, Math.min(offset, along - w));
  w = Math.max(10, Math.min(w, along - o));
  return { offset_along_cm: snapCm(o), width_cm: snapCm(w) };
}

export function TemplatePassageOverlay({
  width_cm,
  depth_cm,
  passages,
  selectedIndex,
  onSelectIndex,
  onChangePassages,
  className = "",
}: TemplatePassageOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 320, h: 160 });
  const dragRef = useRef<DragState | null>(null);
  const passagesRef = useRef(passages);
  passagesRef.current = passages;

  const alongCm = Math.max(1, snapCm(depth_cm));
  const acrossCm = Math.max(1, snapCm(width_cm));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setBox({ w: Math.max(120, cr.width), h: Math.max(80, cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = 12;
  const scale = Math.min((box.w - pad * 2) / acrossCm, (box.h - pad * 2) / alongCm);
  const drawW = acrossCm * scale;
  const drawH = alongCm * scale;
  const ox = (box.w - drawW) / 2;
  const oy = (box.h - drawH) / 2;

  const clientToAlongCm = useCallback(
    (clientY: number) => {
      const el = containerRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const y = clientY - rect.top - oy;
      return Math.max(0, Math.min(alongCm, y / scale));
    },
    [alongCm, oy, scale]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const along = clientToAlongCm(e.clientY);
      const next = passagesRef.current.map((p, i) => {
        if (i !== drag.index) return p;
        if (drag.mode === "move") {
          const delta = along - clientToAlongCm(drag.startClientY);
          const clamped = clampTemplatePassage(alongCm, drag.originOffset + delta, drag.originWidth);
          return { ...p, ...clamped };
        }
        if (drag.mode === "resize-start") {
          const end = drag.originOffset + drag.originWidth;
          const newOffset = Math.max(0, Math.min(along, end - 10));
          return { ...p, ...clampTemplatePassage(alongCm, newOffset, end - newOffset) };
        }
        const newEnd = Math.max(drag.originOffset + 10, Math.min(along, alongCm));
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
      startClientY: e.clientY,
      originOffset: p.offset_along_cm,
      originWidth: p.width_cm,
    };
  };

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="shrink-0 flex items-center justify-between gap-2 mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Przejazdy — widok z góry</p>
        <p className="text-[11px] text-slate-400">oś wzdłuż głębokości · pełna szerokość</p>
      </div>
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 min-w-0 rounded-xl border border-slate-200/70 bg-slate-50/80 overflow-hidden touch-none"
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
            stroke="#64748b"
            strokeWidth={1.5}
          />
          {passages.map((p, idx) => {
            const clamped = clampTemplatePassage(alongCm, p.offset_along_cm, p.width_cm);
            const y = oy + (clamped.offset_along_cm / alongCm) * drawH;
            const h = Math.max(4, (clamped.width_cm / alongCm) * drawH);
            const selected = selectedIndex === idx;
            const disabled = p.enabled === false;
            return (
              <g key={idx}>
                <rect
                  x={ox}
                  y={y}
                  width={drawW}
                  height={h}
                  fill={disabled ? "rgba(148,163,184,0.35)" : "rgba(6,182,212,0.35)"}
                  stroke={selected ? "#0891b2" : disabled ? "#94a3b8" : "#06b6d4"}
                  strokeWidth={selected ? 2.5 : 1.5}
                  className="cursor-grab"
                  onPointerDown={(e) => startDrag(idx, "move", e)}
                />
                <rect
                  x={ox}
                  y={y - 3}
                  width={drawW}
                  height={6}
                  fill={selected ? "#0891b2" : "#22d3ee"}
                  className="cursor-ns-resize"
                  onPointerDown={(e) => startDrag(idx, "resize-start", e)}
                />
                <rect
                  x={ox}
                  y={y + h - 3}
                  width={drawW}
                  height={6}
                  fill={selected ? "#0891b2" : "#22d3ee"}
                  className="cursor-ns-resize"
                  onPointerDown={(e) => startDrag(idx, "resize-end", e)}
                />
              </g>
            );
          })}
        </svg>
        {passages.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 pointer-events-none px-4 text-center">
            Brak przejazdów — dodaj w formularzu lub kliknij „+ Dodaj przejazd”
          </p>
        ) : null}
      </div>
    </div>
  );
}
