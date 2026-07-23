import type { WarehouseCarrierRead } from "../../../api/wmsCarrierApi";
import { formatCarrierCode } from "../../../utils/formatCarrierCode";
import {
  carrierPrefixMeta,
  carrierVisualStyle,
  CARRIER_CODE_DISPLAY_ZERO_PAD,
} from "./carrierConstants";
import { CarrierMixBadge } from "./CarrierMixBadge";

type Props = {
  carrier: Pick<WarehouseCarrierRead, "code" | "barcode" | "name" | "notes" | "is_mixed">;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** Nazwa biznesowa na pierwszym planie; kod techniczny jako meta (bez duplikacji). */
export function CarrierIdentity({ carrier, size = "md", className = "" }: Props) {
  const rawCode = (carrier.barcode || carrier.code || "").trim();
  const formattedCode = formatCarrierCode(rawCode, { zeroPad: CARRIER_CODE_DISPLAY_ZERO_PAD });
  const displayName = (carrier.name || "").trim();
  const description = (carrier.notes || "").trim();
  const prefix = rawCode.split("-")[0]?.toUpperCase() ?? "";
  const meta = carrierPrefixMeta(prefix);
  const visual = carrierVisualStyle();

  const titleClass =
    size === "lg"
      ? "text-[18px] font-bold leading-snug text-slate-900"
      : size === "sm"
        ? "text-[14px] font-bold leading-snug text-slate-900"
        : "text-[16px] font-bold leading-snug text-slate-900";

  const codeClass =
    size === "lg" ? "text-[13px]" : size === "sm" ? "text-[11px]" : "text-[12px]";

  const primaryLabel = displayName || formattedCode;

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex min-w-0 items-start gap-2">
        <span
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-black"
          style={{ backgroundColor: visual.bg, color: visual.fg, border: `1px solid ${visual.border}` }}
          title={meta?.label ?? "Nośnik"}
          data-carrier-identity-icon="true"
        >
          {meta?.icon ?? "NS"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className={`truncate ${titleClass}`}>{primaryLabel}</p>
            {carrier.is_mixed ? <CarrierMixBadge isMixed size="sm" /> : null}
          </div>
          {displayName ? (
            <p className={`mt-0.5 truncate font-mono tabular-nums text-slate-500 ${codeClass}`}>{formattedCode}</p>
          ) : null}
          {description ? (
            <p
              className={`mt-0.5 line-clamp-1 text-slate-500 ${size === "sm" ? "text-[12px]" : "text-[13px]"}`}
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
