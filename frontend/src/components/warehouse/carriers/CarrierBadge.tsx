import { formatCarrierCode } from "../../../utils/formatCarrierCode";
import {
  CARRIER_CODE_DISPLAY_ZERO_PAD,
  carrierPrefixMeta,
  CARRIER_PREFIX_META,
} from "./carrierConstants";
import { CarrierMixBadge } from "./CarrierMixBadge";

type Props = {
  code: string;
  showMix?: boolean;
  className?: string;
};

const FALLBACK = CARRIER_PREFIX_META.CRT;

/** Kompaktowy badge kodu nośnika — kolory/ikona z ``carrierPrefixMeta`` (jak w kreatorze / CarrierIdentity). */
export function CarrierBadge({ code, showMix, className = "" }: Props) {
  const raw = (code || "").trim();
  const formatted = formatCarrierCode(raw, { zeroPad: CARRIER_CODE_DISPLAY_ZERO_PAD });
  const prefix = raw.split("-")[0]?.toUpperCase() ?? "";
  const meta = carrierPrefixMeta(prefix) ?? FALLBACK;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left shadow-sm ${className}`}
      style={{ backgroundColor: meta.bg, borderColor: meta.border, borderWidth: 1, color: meta.fg }}
      title={raw || formatted}
    >
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-black leading-none"
        style={{ backgroundColor: meta.border, color: meta.fg }}
        aria-hidden
      >
        {meta.icon}
      </span>
      <span className="min-w-0 truncate font-mono text-[12px] font-semibold leading-none tracking-tight">
        {formatted}
      </span>
      {showMix ? <CarrierMixBadge isMixed size="sm" /> : null}
    </span>
  );
}
