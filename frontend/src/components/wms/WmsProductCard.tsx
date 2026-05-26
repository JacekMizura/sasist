import { type ReactNode } from "react";

/** Fixed tile for product photo — contain + center (no crop). Matches WMS receiving line cards. */
export const WMS_PRODUCT_CARD_IMG_BOX =
  "flex h-[100px] w-[100px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-transparent";

export const wmsProductCardMetaMuted = "mt-0.5 text-[11px] leading-snug text-slate-500";

export function WmsProductCardKebabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

type WmsProductCardProps = {
  index: number;
  /** Kebab trigger + dropdown; omit on putaway list. Wrap root with `[data-wms-product-card-menu]` so card clicks ignore it. */
  menu?: ReactNode;
  /** Decorative layer (e.g. completed putaway watermark). Pointer-events none; rendered behind main content. */
  overlay?: ReactNode;
  imageUrl: string | null | undefined;
  body: ReactNode;
  footer: ReactNode;
  interactive: boolean;
  busy?: boolean;
  scanFlash?: boolean;
  /** Amber ring (receiving: wada). */
  ringDefect?: boolean;
  /** Muted / non-clickable (putaway: line fully put away). */
  subdued?: boolean;
  /** Appended to article (e.g. putaway-completed green surface). */
  extraArticleClassName?: string;
  onCardActivate?: () => void;
};

/**
 * Shared WMS product line card shell: index badge, kebab, 100×100 image, body column, footer slot.
 * Used by Przyjęcie (liczenie PZ) and Rozlokowanie so both tabs share the same layout.
 */
export function WmsProductCard({
  index,
  menu,
  overlay,
  imageUrl,
  body,
  footer,
  interactive,
  busy = false,
  scanFlash,
  ringDefect,
  subdued,
  extraArticleClassName,
  onCardActivate,
}: WmsProductCardProps) {
  const activate = () => {
    if (!interactive || busy) return;
    onCardActivate?.();
  };

  const showMenu = menu != null;

  const inner = (
    <>
      <div
        className={`mb-2 flex shrink-0 items-center gap-2 ${showMenu ? "justify-between" : "justify-start"}`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-sm font-bold tabular-nums text-slate-700 ring-1 ring-slate-200/80">
          {index}
        </span>
        {showMenu ? (
          <div className="relative" data-wms-product-card-menu="">
            {menu}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className={WMS_PRODUCT_CARD_IMG_BOX}>
          {imageUrl ? (
            <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain object-center" />
          ) : (
            <span className="text-xs font-medium text-slate-400">Brak zdjęcia</span>
          )}
        </div>
        <div className="min-w-0 flex-1">{body}</div>
      </div>

      {footer}
    </>
  );

  return (
    <article
      role="button"
      tabIndex={interactive && !busy ? 0 : undefined}
      onKeyDown={(e) => {
        if (!interactive || busy) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      onClick={(e) => {
        if (!interactive || busy) return;
        if ((e.target as HTMLElement).closest("[data-wms-product-card-menu], [data-wms-card-no-nav]")) return;
        activate();
      }}
      className={`relative flex h-full min-h-0 flex-col rounded-2xl border bg-white p-3 shadow-sm transition-[box-shadow,background-color,ring-color,ring-width,opacity,filter] duration-500 hover:shadow-md ${
        interactive && !busy ? "cursor-pointer" : ""
      } ${
        scanFlash
          ? "border-violet-400 bg-violet-50/90 ring-4 ring-violet-300/80 shadow-[0_0_0_1px_rgba(139,92,246,0.25)]"
          : ringDefect
            ? "border-amber-400 ring-2 ring-amber-200/80"
            : subdued
              ? "border-emerald-200 opacity-75 ring-1 ring-emerald-100"
              : "border-slate-200"
      } ${overlay ? "overflow-hidden" : ""} ${extraArticleClassName ?? ""}`}
    >
      {overlay ? (
        <>
          <div className="relative z-[1] flex min-h-0 flex-1 flex-col">{inner}</div>
          <div
            className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center overflow-hidden"
            aria-hidden
          >
            {overlay}
          </div>
        </>
      ) : (
        inner
      )}
    </article>
  );
}
