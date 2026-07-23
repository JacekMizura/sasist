import { formatCarrierCode } from "../../../utils/formatCarrierCode";
import {
  CARRIER_CODE_DISPLAY_ZERO_PAD,
  carrierPrefixMeta,
  carrierVisualStyle,
} from "./carrierConstants";
import { CarrierMixBadge } from "./CarrierMixBadge";

type Props = {
  code: string;
  showMix?: boolean;
  className?: string;
};

/**
 * Globalny badge kodu nośnika — zawsze fioletowy (``CARRIER_VISUAL``).
 * Prefix wpływa tylko na ikonę/etykietę typu, nie na kolor.
 */
export function CarrierBadge({ code, showMix, className = "" }: Props) {
  const raw = (code || "").trim();
  const formatted = formatCarrierCode(raw, { zeroPad: CARRIER_CODE_DISPLAY_ZERO_PAD });
  const prefix = raw.split("-")[0]?.toUpperCase() ?? "";
  const meta = carrierPrefixMeta(prefix);
  const visual = carrierVisualStyle();
  const icon = meta?.icon ?? "NS";

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left shadow-sm ${className}`}
      style={{ backgroundColor: visual.bg, borderColor: visual.border, borderWidth: 1, color: visual.fg }}
      title={raw || formatted}
      data-carrier-badge="true"
    >
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-black leading-none"
        style={{ backgroundColor: visual.border, color: visual.fg }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 truncate font-mono text-[12px] font-semibold leading-none tracking-tight">
        {formatted}
      </span>
      {showMix ? <CarrierMixBadge isMixed size="sm" /> : null}
    </span>
  );
}
