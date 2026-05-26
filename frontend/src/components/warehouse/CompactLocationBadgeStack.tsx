import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LocationTypeBadge } from "./LocationTypeBadge";

export type CompactLocationBadgeItem = {
  locationText: string;
  quantity?: number;
  storageType: unknown;
};

type Props = {
  items: CompactLocationBadgeItem[];
  /** Domyślnie 2 — reszta pod „+N” z panelem hover/klik. */
  maxVisible?: number;
  /** Opcjonalna etykieta nad badge’ami (np. kontekst poza zamówieniem). */
  sectionLabel?: string | null;
};

const HIDE_DELAY_MS = 320;

/**
 * Kompaktowe badge lokalizacji (max N w linii, reszta +overflow).
 * Panel dodatkowych lokalizacji w portalu (`fixed`) — bez obcinania przez wiersz zamówienia.
 */
export function CompactLocationBadgeStack({ items, maxVisible = 2, sectionLabel }: Props) {
  const vis = Math.max(1, maxVisible);
  const clean = items.filter((it) => (it.locationText ?? "").trim().length > 0);
  if (clean.length === 0) return null;

  const shown = clean.slice(0, vis);
  const hidden = clean.slice(vis);
  const overflow = hidden.length;

  return (
    <div className="min-w-0 space-y-1">
      {sectionLabel ? (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{sectionLabel}</p>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {shown.map((it, i) => (
          <LocationTypeBadge
            key={`${it.locationText}-${i}`}
            locationText={it.locationText}
            quantity={it.quantity}
            storageType={it.storageType}
            compact
            className="!max-w-[min(100%,11rem)] shrink-0"
          />
        ))}
        {overflow > 0 ? <LocationOverflowExtra hidden={hidden} /> : null}
      </div>
    </div>
  );
}

function LocationOverflowExtra({ hidden }: { hidden: CompactLocationBadgeItem[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const clearHide = useCallback(() => {
    if (hideTimer.current != null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHide();
    hideTimer.current = window.setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  }, [clearHide]);

  const enter = useCallback(() => {
    clearHide();
    setOpen(true);
  }, [clearHide]);

  const updatePosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxW = Math.min(280, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - maxW - 8));
    setPanelStyle({
      position: "fixed",
      top: r.bottom + 6,
      left,
      zIndex: 450,
      width: maxW,
      maxHeight: "min(60vh, 18rem)",
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const fn = () => updatePosition();
    window.addEventListener("scroll", fn, true);
    window.addEventListener("resize", fn);
    return () => {
      window.removeEventListener("scroll", fn, true);
      window.removeEventListener("resize", fn);
    };
  }, [open, updatePosition]);

  useEffect(
    () => () => {
      clearHide();
    },
    [clearHide],
  );

  const n = hidden.length;
  if (n === 0) return null;

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            data-location-overflow-panel
            role="dialog"
            aria-label="Pozostałe lokalizacje"
            className="flex flex-col gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
            style={panelStyle}
            onMouseEnter={enter}
            onMouseLeave={scheduleHide}
            onClick={(e) => e.stopPropagation()}
          >
            {hidden.map((it, i) => (
              <LocationTypeBadge
                key={`${it.locationText}-ov-${i}`}
                locationText={it.locationText}
                quantity={it.quantity}
                storageType={it.storageType}
                compact
                layoutSpread
                className="w-full"
              />
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="inline-flex h-7 min-h-7 shrink-0 items-center rounded border border-slate-300 bg-slate-50 px-2.5 font-mono text-[13px] font-semibold tabular-nums leading-none text-slate-800 shadow-sm"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Pokaż ${n} dodatkowych lokalizacji`}
        onClick={(e) => {
          e.stopPropagation();
          enter();
        }}
        onMouseEnter={enter}
        onMouseLeave={scheduleHide}
      >
        +{n}
      </button>
      {panel}
    </>
  );
}
