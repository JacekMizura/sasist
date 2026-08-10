import type { ReactNode } from "react";
import { PackingLocationPill } from "../packing/packingProductCardParts";
import { PICKING_FIELD_LABEL_CLASS } from "./pickingUiTokens";
import { wmsTypoClass } from "../../../wms/typography/wmsOperatorTypography";

export function PickingFieldLabel({ children }: { children: ReactNode }) {
  return <span className={PICKING_FIELD_LABEL_CLASS}>{children}</span>;
}

/** Sasist location badge — same look as packing (`PackingLocationPill`). */
export function PickingLocationBadge({
  text,
  muted,
  className,
}: {
  text: string;
  muted?: boolean;
  className?: string;
}) {
  if (!text.trim()) return null;
  return (
    <div className={["min-w-0 max-w-full", className].filter(Boolean).join(" ")}>
      <PackingLocationPill text={text} muted={muted} />
    </div>
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
