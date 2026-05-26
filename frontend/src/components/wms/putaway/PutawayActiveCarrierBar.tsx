import { Package } from "lucide-react";
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
    <div className="inline-flex max-w-full flex-wrap items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 transition-all">
      <Package size={16} className="shrink-0 text-slate-400" strokeWidth={2.5} />
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nośnik</span>
      
      <ReceivingCarrierBadge code={activeCode!} className="text-xs" />
      
      <span className="hidden text-slate-300 sm:inline">•</span>
      <span className="hidden tabular-nums text-slate-500 sm:inline">
        SKU <span className="text-slate-800">{skuCount}</span>
      </span>
      <span className="hidden text-slate-300 sm:inline">•</span>
      <span className="hidden tabular-nums text-slate-500 sm:inline">
        <span className="text-slate-800">{unitCount}</span> szt.
      </span>

      <div className="mx-1 hidden h-4 w-px bg-slate-200 sm:inline" aria-hidden />

      <button
        type="button"
        disabled={disabled}
        onClick={onClear}
        className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 disabled:opacity-50"
      >
        Wyczyść
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onResetSession}
        className="rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 disabled:opacity-50"
      >
        Reset
      </button>
    </div>
  );
}