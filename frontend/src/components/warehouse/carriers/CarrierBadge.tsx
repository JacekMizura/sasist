import { formatCarrierCode } from "../../../utils/formatCarrierCode";
import { CARRIER_CODE_DISPLAY_ZERO_PAD } from "./carrierConstants";

type Props = {
  code: string;
  showMix?: boolean;
  className?: string;
};

/** Kompaktowy badge kodu nośnika (meta, nie tytuł). */
export function CarrierBadge({ code, showMix, className = "" }: Props) {
  const formatted = formatCarrierCode(code, { zeroPad: CARRIER_CODE_DISPLAY_ZERO_PAD });
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 font-mono text-[12px] font-semibold text-slate-600 ${className}`}
      title={code.trim()}
    >
      <span className="min-w-0 truncate">{formatted}</span>
      {showMix ? (
        <span className="shrink-0 rounded-full bg-violet-100 px-1.5 text-[10px] font-bold uppercase text-violet-800">
          MIX
        </span>
      ) : null}
    </span>
  );
}
