import type { ReactNode } from "react";
import { Icon } from "../../ui/Icon";
import { PackingEanBadge, PackingLocationPill } from "../packing/packingProductCardParts";
import { PICKING_FIELD_LABEL_CLASS } from "./pickingUiTokens";
import { wmsTypoClass } from "../../../wms/typography/wmsOperatorTypography";

export function PickingFieldLabel({ children }: { children: ReactNode }) {
  return <span className={PICKING_FIELD_LABEL_CLASS}>{children}</span>;
}

/** Sasist location badge — same look as packing (`PackingLocationPill`).
 * Placement is view-specific: compact (list tile corner) vs bar (product header).
 */
export function PickingLocationBadge({
  text,
  muted,
  className,
  variant = "compact",
}: {
  text: string;
  muted?: boolean;
  className?: string;
  /** compact = list tile top-right; bar = full-width next to ← on product/qty */
  variant?: "compact" | "bar";
}) {
  if (!text.trim()) return null;
  if (variant === "bar") {
    return (
      <div className={["min-w-0 w-full flex-1", className].filter(Boolean).join(" ")}>
        <PackingLocationPill text={text} muted={muted} fullWidth size="bar" />
      </div>
    );
  }
  return (
    <div className={["inline-flex w-fit max-w-full shrink-0", className].filter(Boolean).join(" ")}>
      <PackingLocationPill text={text} muted={muted} fullWidth={false} />
    </div>
  );
}

/** Sasist EAN badge — reuses packing `PackingEanBadge` (scales with WMS base font). */
export function PickingEanBadge({
  value,
  muted,
  className,
}: {
  value: string | null | undefined;
  muted?: boolean;
  className?: string;
}) {
  const text = (value ?? "").trim();
  if (!text) return null;
  return (
    <p
      className={[
        "flex min-w-0 flex-wrap items-center gap-1.5 text-slate-500",
        wmsTypoClass.base,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="shrink-0 text-slate-500">EAN:</span>
      <PackingEanBadge value={text} muted={muted} />
    </p>
  );
}

/** Red shortage pill — same language as packing order cards (`BRAK X/Y`). */
export function PickingShortageBadge({
  missing,
  total,
}: {
  missing: string | number;
  total: string | number;
}) {
  return (
    <span className="inline-flex rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
      BRAK {missing}/{total}
    </span>
  );
}

/** Sasist cart badge — same language as status tiles („Wózek: …”). */
export function PickingCartBadge({ label }: { label: string }) {
  const text = label.trim();
  if (!text) return null;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm"
      title={`Wózek: ${text}`}
    >
      <Icon name="cart" size={12} className="shrink-0 text-slate-600" aria-hidden />
      <span className="truncate">
        Wózek: <span className="font-bold tabular-nums tracking-tight">{text}</span>
      </span>
    </span>
  );
}

export function PickingQtyPair({
  picked,
  total,
  className,
}: {
  picked: string | number;
  total: string | number;
  className?: string;
}) {
  return (
    <span className={["font-bold text-slate-900", wmsTypoClass.quantity, className].filter(Boolean).join(" ")}>
      {picked}/{total}
    </span>
  );
}
