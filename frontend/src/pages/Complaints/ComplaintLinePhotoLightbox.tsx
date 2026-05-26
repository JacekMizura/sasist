import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";

export type ComplaintLinePhotoKind = "customer" | "warehouse";

export type ComplaintLinePhotoItem = {
  url: string;
  kind: ComplaintLinePhotoKind;
};

const KIND_LABEL: Record<ComplaintLinePhotoKind, string> = {
  customer: "Customer",
  warehouse: "Warehouse",
};

/** Customer photos first, then warehouse — single canonical order for the lightbox. */
export function buildComplaintLinePhotoList(
  customerPhotos: string[],
  warehousePhotos: string[],
): ComplaintLinePhotoItem[] {
  const c = customerPhotos.map((url) => ({ url, kind: "customer" as const }));
  const w = warehousePhotos.map((url) => ({ url, kind: "warehouse" as const }));
  return [...c, ...w];
}

export function customerThumbGlobalIndex(customerIndex: number): number {
  return customerIndex;
}

export function warehouseThumbGlobalIndex(customerCount: number, warehouseIndex: number): number {
  return customerCount + warehouseIndex;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const WHEEL_ZOOM_SENS = 0.0015;

type Props = {
  open: boolean;
  items: ComplaintLinePhotoItem[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
};

export default function ComplaintLinePhotoLightbox({ open, items, index, onIndexChange, onClose }: Props) {
  const safeLen = items.length;
  const safeIndex = safeLen > 0 ? Math.min(Math.max(0, index), safeLen - 1) : 0;

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mountedVisible, setMountedVisible] = useState(false);
  const [dragging, setDragging] = useState(false);

  const dragRef = useRef<{ active: boolean; pointerId: number | null; startX: number; startY: number; panX: number; panY: number }>(
    { active: false, pointerId: null, startX: 0, startY: 0, panX: 0, panY: 0 },
  );
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!open) {
      setMountedVisible(false);
      resetView();
      return;
    }
    const id = window.requestAnimationFrame(() => setMountedVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, [open, resetView]);

  useEffect(() => {
    if (!open) return;
    resetView();
  }, [open, safeIndex, resetView]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = stripRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-strip-idx="${safeIndex}"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [open, safeIndex]);

  useEffect(() => {
    if (!open || safeLen === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onIndexChange((safeIndex - 1 + safeLen) % safeLen);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onIndexChange((safeIndex + 1) % safeLen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, safeLen, safeIndex, onClose, onIndexChange]);

  const current = items[safeIndex];
  const src = useMemo(() => (current?.url ? resolveDamageMediaUrl(current.url) : ""), [current?.url]);

  const goPrev = useCallback(() => {
    if (safeLen <= 0) return;
    onIndexChange((safeIndex - 1 + safeLen) % safeLen);
  }, [safeIndex, safeLen, onIndexChange]);

  const goNext = useCallback(() => {
    if (safeLen <= 0) return;
    onIndexChange((safeIndex + 1) % safeLen);
  }, [safeIndex, safeLen, onIndexChange]);

  useLayoutEffect(() => {
    if (!open || safeLen === 0) return;
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * WHEEL_ZOOM_SENS;
      setScale((s) => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * (1 + delta)));
        if (next <= MIN_SCALE) setPan({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, safeLen]);

  const onPointerDownImage = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      if (scale <= MIN_SCALE) return;
      if (e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      dragRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [scale, pan.x, pan.y],
  );

  const onPointerMoveStage = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current = { ...dragRef.current, active: false, pointerId: null };
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  if (!open || safeLen === 0) return null;

  const kindLabel = current ? KIND_LABEL[current.kind] : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className={`fixed inset-0 z-[130] flex flex-col overscroll-none bg-black/90 transition-opacity duration-200 ease-out ${
        mountedVisible ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="rounded-md bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
            {kindLabel}
          </span>
          <span className="tabular-nums text-sm text-white/80">
            {safeIndex + 1} / {safeLen}
          </span>
        </div>
        <button
          type="button"
          className="rounded-lg p-2 text-white transition-colors hover:bg-white/15"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden px-2 pb-2 sm:px-4">
        <button
          type="button"
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:left-4"
          aria-label="Previous image"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
        <button
          type="button"
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:right-4"
          aria-label="Next image"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
        >
          <ChevronRight className="h-7 w-7" />
        </button>

        <div
          ref={stageRef}
          className={`flex h-full w-full touch-none items-center justify-center ${scale > MIN_SCALE ? "cursor-grab active:cursor-grabbing" : ""}`}
          onClick={onClose}
        >
          <div
            role="presentation"
            className="relative flex max-h-full max-w-full items-center justify-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transition: dragging ? "none" : "transform 0.2s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={onPointerDownImage}
            onPointerMove={onPointerMoveStage}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {src ? (
              <img
                key={safeIndex}
                src={src}
                alt=""
                draggable={false}
                className="max-h-[min(85vh,900px)] max-w-[min(96vw,1200px)] select-none object-contain shadow-2xl duration-200 animate-in fade-in"
              />
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="shrink-0 border-t border-white/10 bg-black/40 px-2 py-2 sm:px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={stripRef}
          className="flex w-full gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin]"
        >
          {items.map((it, i) => {
            const tSrc = resolveDamageMediaUrl(it.url);
            const active = i === safeIndex;
            return (
              <button
                key={`${it.url}-${i}`}
                type="button"
                data-strip-idx={i}
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 bg-black/30 transition-[border-color,opacity] duration-150 ${
                  active ? "border-blue-400 opacity-100" : "border-white/20 opacity-70 hover:border-white/50 hover:opacity-100"
                }`}
                title={`${KIND_LABEL[it.kind]} · ${i + 1} / ${safeLen}`}
                aria-label={`Photo ${i + 1}, ${KIND_LABEL[it.kind]}`}
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  onIndexChange(i);
                }}
              >
                <img src={tSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
                <span
                  className={`absolute bottom-0 left-0 right-0 truncate px-0.5 py-px text-center text-[9px] font-medium uppercase leading-none text-white ${
                    it.kind === "customer" ? "bg-blue-600/90" : "bg-amber-700/90"
                  }`}
                >
                  {it.kind === "customer" ? "C" : "W"}
                </span>
              </button>
            );
          })}
        </div>
        {scale > MIN_SCALE ? (
          <p className="mt-1 text-center text-[11px] text-white/50">
            Kółko myszy — powiększenie · przeciągnij, aby przesunąć · zmiana zdjęcia resetuje widok
          </p>
        ) : null}
      </div>
    </div>
  );
}
