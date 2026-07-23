import { Package } from "lucide-react";
import { carrierVisualClasses } from "../../warehouse/carriers/carrierConstants";
import { ReceivingCarrierBadge } from "../receiving/carriers/ReceivingCarrierBadge";

type Props = {
  activeCode: string | null;
  skuCount: number;
  unitCount: number;
  onClear: () => void;
  onResetSession: () => void;
  disabled?: boolean;
};

export function PutawayActiveCarrierBar({
  activeCode,
  skuCount,
  unitCount,
  onClear,
  onResetSession,
  disabled,
}: Props) {
  const hasCarrier = !!(activeCode || "").trim();

  if (!hasCarrier) return null;

  return (
    <div
      className={`inline-flex max-w-full flex-wrap items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-bold text-violet-900 transition-all ${carrierVisualClasses.bar}`}
    >
      <Package size={16} className={`shrink-0 ${carrierVisualClasses.barIcon}`} strokeWidth={2.5} />
      <span className={`text-[10px] font-black uppercase tracking-widest ${carrierVisualClasses.barLabel}`}>
        Nośnik
      </span>

      <ReceivingCarrierBadge code={activeCode!} className="text-xs" />

      <span className="hidden text-violet-300 sm:inline">•</span>
      <span className="hidden tabular-nums text-violet-800/80 sm:inline">
        SKU <span className="text-violet-950">{skuCount}</span>
      </span>
      <span className="hidden text-violet-300 sm:inline">•</span>
      <span className="hidden tabular-nums text-violet-800/80 sm:inline">
        <span className="text-violet-950">{unitCount}</span> szt.
      </span>

      <div className="mx-1 hidden h-4 w-px bg-violet-200 sm:inline" aria-hidden />

      <button
        type="button"
        disabled={disabled}
        onClick={onClear}
        className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-700 transition-colors hover:bg-violet-100 hover:text-violet-950 disabled:opacity-50"
      >
        Wyczyść
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onResetSession}
        className="rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider text-violet-700 transition-colors hover:bg-violet-100 hover:text-violet-950 disabled:opacity-50"
      >
        Reset
      </button>
    </div>
  );
}
