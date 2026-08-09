import type { ReactNode } from "react";
import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import { PackingLineActionsMenu } from "./PackingLineActionsMenu";

const LABEL =
  "text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400";

export function packingLocationBadge(line: WmsPackingOrderLineApi): string {
  const loc = (line.location_label ?? "").trim();
  const locQty = line.location_bin_qty;
  return loc && locQty != null && locQty > 0 ? `${loc} (x${locQty})` : loc || "—";
}

export function PackingCardFieldLabel({ children, muted }: { children: string; muted?: boolean }) {
  return <span className={[LABEL, muted ? "text-slate-300" : ""].join(" ")}>{children}</span>;
}

export function PackingLocationPill({
  text,
  muted,
}: {
  text: string;
  muted?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex w-full max-w-[7.25rem] items-center justify-center truncate rounded-full border px-2 py-0.5 text-center text-[11px] font-bold leading-tight",
        muted
          ? "border-emerald-300/80 text-emerald-800"
          : "border-slate-800 text-slate-900",
      ].join(" ")}
      title={text}
    >
      {text}
    </span>
  );
}

/** Nagłówek prawej strony kafelka (Siatka): stała kolumna lokalizacji + menu przy prawej krawędzi. */
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
    <div className="flex shrink-0 items-start gap-0.5">
      {showLocation ? (
        <div className="flex w-[7.25rem] shrink-0 flex-col items-end gap-1">
          <PackingCardFieldLabel muted={muted}>LOKALIZACJA</PackingCardFieldLabel>
          <PackingLocationPill text={locBadge} muted={muted} />
        </div>
      ) : null}
      <div className="-mr-1.5 -mt-0.5 shrink-0">{menu}</div>
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
      className="flex shrink-0 items-center justify-center overflow-hidden bg-white"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className={["max-h-full max-w-full object-contain", muted ? "grayscale opacity-70" : ""].join(" ")}
          loading="lazy"
        />
      ) : (
        <span className="text-2xl text-slate-300">—</span>
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
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#E53935] text-white"
      aria-hidden
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}
