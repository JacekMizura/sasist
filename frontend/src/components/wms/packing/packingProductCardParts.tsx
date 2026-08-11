import type { ReactNode } from "react";
import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import { wmsTypoClass } from "../../../wms/typography/wmsOperatorTypography";
import { PackingLineActionsMenu } from "./PackingLineActionsMenu";

const LABEL = "text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400";

export function packingLocationBadge(line: WmsPackingOrderLineApi): string {
  const loc = (line.location_label ?? "").trim();
  if (!loc) return "";
  const locQty = line.location_bin_qty;
  return locQty != null && locQty > 0 ? `${loc} (${locQty})` : loc;
}

export function PackingCardFieldLabel({ children, muted }: { children: string; muted?: boolean }) {
  return <span className={[LABEL, muted ? "text-emerald-700/70" : ""].join(" ")}>{children}</span>;
}

export function PackingLocationPill({
  text,
  muted,
  fullWidth = true,
}: {
  text: string;
  muted?: boolean;
  /** Packing grid / product header bar. List tile corners should pass false. */
  fullWidth?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex max-w-full min-w-0 items-center justify-center rounded-full border px-2 py-0.5 text-center font-bold",
        fullWidth ? "w-full" : "w-auto",
        wmsTypoClass.location,
        muted
          ? "border-emerald-400/90 bg-white/40 text-emerald-900"
          : "border-slate-800 bg-white text-slate-900",
      ].join(" ")}
      title={text}
    >
      {text}
    </span>
  );
}

/** Sasist EAN chip — shared by packing + picking (do not duplicate).
 * Font size follows WMS base typography (`--wms-font-base`), not a fixed px.
 */
export function PackingEanBadge({ value, muted }: { value: string; muted?: boolean }) {
  const text = value.trim();
  if (!text) return null;
  return (
    <span
      className={[
        "inline-flex max-w-full items-center truncate rounded-md border px-2 py-1 font-mono font-bold leading-none",
        wmsTypoClass.base,
        muted
          ? "border-blue-300 bg-white text-blue-950"
          : "border-blue-200 bg-[#dbeafe] text-[#1e3a8a]",
      ].join(" ")}
      title={text}
    >
      {text}
    </span>
  );
}

/** Nagłówek prawej strony kafelka (Siatka): lokalizacja + menu przy prawej krawędzi. */
export function PackingGridLocationHeader({
  showLocation,
  locBadge,
  menu,
  muted,
}: {
  showLocation: boolean;
  locBadge: string;
  menu: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="ml-auto flex min-w-0 max-w-[min(100%,11rem)] shrink items-start gap-1">
      {showLocation && locBadge ? (
        <div className="flex min-w-0 flex-1 flex-col items-end gap-1">
          <PackingCardFieldLabel muted={muted}>LOKALIZACJA</PackingCardFieldLabel>
          <PackingLocationPill text={locBadge} muted={muted} />
        </div>
      ) : null}
      <div className="-mr-1 -mt-0.5 shrink-0">{menu}</div>
    </div>
  );
}

export function PackingProductThumb({
  url,
  size,
  muted,
}: {
  url: string | null | undefined;
  size: number;
  muted?: boolean;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden bg-transparent"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className={[
            "max-h-full max-w-full object-contain",
            muted ? "opacity-55 grayscale" : "",
          ].join(" ")}
          loading="lazy"
        />
      ) : (
        <span className="text-2xl text-slate-200" aria-hidden>
          {"\u00A0"}
        </span>
      )}
    </div>
  );
}

export function PackingCardMenu({
  disabled,
  onMarkShortage,
}: {
  disabled?: boolean;
  onMarkShortage?: () => void;
}) {
  if (!onMarkShortage) return null;
  return <PackingLineActionsMenu disabled={disabled} onMarkShortage={onMarkShortage} />;
}

export function PackingDoneCheckIcon() {
  return (
    <span
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#4CAF50] text-white"
      aria-hidden
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function PackingDoneCloseIcon() {
  return (
    <span
      className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#E53935] text-white shadow-sm"
      aria-hidden
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Wspólne klasy karty spakowanej — zielone tło na całej powierzchni, bez białych „łat”. */
export const PACKING_DONE_CARD_CLASS =
  "border border-emerald-300/90 bg-[rgba(232,245,233,0.72)] text-left";
