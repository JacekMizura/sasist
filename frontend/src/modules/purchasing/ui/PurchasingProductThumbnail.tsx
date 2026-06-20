import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import { createPortal } from "react-dom";

import {
  PURCHASING_THUMB_SIZE_CLASS,
  type PurchasingThumbSize,
  purchasingHoverPreviewCardClass,
  purchasingHoverPreviewImageClass,
  purchasingThumbBoxClass,
  purchasingThumbImgClass,
} from "./purchasingProductThumbnailTokens";

const HOVER_DELAY_MS = 150;

export type PurchasingProductThumbnailProps = {
  imageUrl?: string | null;
  name: string;
  sku?: string | null;
  stock?: number | null;
  incomingQty?: number | null;
  unit?: string | null;
  size?: PurchasingThumbSize;
  /** Podgląd po najechaniu — domyślnie włączony dla rozmiaru table. */
  hoverPreview?: boolean;
  className?: string;
};

function fmtQty(v: number | null | undefined, unit?: string | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  const u = (unit ?? "szt.").trim() || "szt.";
  return `${v.toLocaleString("pl-PL", { maximumFractionDigits: 3 })} ${u}`;
}

function PurchasingProductThumbnailInner({
  imageUrl,
  name,
  sku,
  stock,
  incomingQty,
  unit,
  size = "table",
  hoverPreview,
  className = "",
}: PurchasingProductThumbnailProps) {
  const src = (imageUrl ?? "").trim();
  const showHover = hoverPreview ?? size === "table";
  const boxSize = PURCHASING_THUMB_SIZE_CLASS[size];

  const anchorRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const [imgState, setImgState] = useState<"idle" | "ok" | "err">("idle");

  useEffect(() => {
    if (!src) {
      setImgState("idle");
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImgState("ok");
    };
    img.onerror = () => {
      if (!cancelled) setImgState("err");
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cardW = 280;
    const cardH = 320;
    let left = rect.right + 10;
    if (left + cardW > window.innerWidth - 8) {
      left = Math.max(8, rect.left - cardW - 10);
    }
    let top = rect.top + rect.height / 2 - cardH / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - cardH - 8));
    setPreviewPos({ top, left });
  }, []);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onEnter = () => {
    if (!showHover) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      updatePosition();
      setPreviewVisible(true);
    }, HOVER_DELAY_MS);
  };

  const onLeave = () => {
    clearTimer();
    setPreviewVisible(false);
  };

  useEffect(() => {
    if (!previewVisible) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [previewVisible, updatePosition]);

  const thumbInner =
    src && imgState === "ok" ? (
      <img src={src} alt="" className={purchasingThumbImgClass} loading="lazy" />
    ) : src && imgState === "idle" ? (
      <span className="h-full w-full animate-pulse bg-slate-100" aria-hidden />
    ) : (
      <ImageIcon className={size === "table" ? "h-5 w-5" : "h-6 w-6"} strokeWidth={1.5} aria-hidden />
    );

  const preview =
    previewVisible && showHover && previewPos && typeof document !== "undefined"
      ? createPortal(
          <div
            className={purchasingHoverPreviewCardClass}
            style={{ position: "fixed", top: previewPos.top, left: previewPos.left }}
            role="tooltip"
          >
            <div className={purchasingHoverPreviewImageClass}>
              {src ? (
                <img src={src} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <ImageIcon className="h-12 w-12 text-slate-300" strokeWidth={1.25} aria-hidden />
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">{name}</p>
            {sku ? <p className="mt-0.5 text-xs text-slate-500">SKU: {sku}</p> : null}
            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <dt className="text-slate-500">Stan</dt>
              <dd className="text-right font-medium tabular-nums text-slate-800">{fmtQty(stock, unit)}</dd>
              {incomingQty != null ? (
                <>
                  <dt className="text-slate-500">W drodze</dt>
                  <dd className="text-right font-medium tabular-nums text-slate-800">{fmtQty(incomingQty, unit)}</dd>
                </>
              ) : null}
            </dl>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        className={`${purchasingThumbBoxClass} ${boxSize} text-slate-300 ${className}`.trim()}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
      >
        {thumbInner}
      </span>
      {preview}
    </>
  );
}

export const PurchasingProductThumbnail = memo(PurchasingProductThumbnailInner);

type CellProps = PurchasingProductThumbnailProps & {
  ean?: string | null;
  subtitle?: string | null;
};

/** Miniatura + nazwa/SKU — standardowa komórka produktu w tabelach Zakupów. */
function PurchasingProductCellInner({
  name,
  sku,
  ean,
  subtitle,
  ...thumbProps
}: CellProps) {
  const meta = subtitle ?? ([sku, ean].filter(Boolean).join(" · ") || "—");
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PurchasingProductThumbnail name={name} sku={sku} {...thumbProps} />
      <div className="min-w-0">
        <div className="truncate font-medium text-slate-900">{name}</div>
        <div className="truncate text-xs text-slate-500">{meta}</div>
      </div>
    </div>
  );
}

export const PurchasingProductCell = memo(PurchasingProductCellInner);
