import { Box } from "lucide-react";
import { ReceivingCarrierBadge } from "./carriers/ReceivingCarrierBadge";

type Props = {
  activeCode: string | null;
  onReceiveLoose: () => void;
  onClear: () => void;
  disabled?: boolean;
};

export function ReceivingActiveCarrierBar({ activeCode, onReceiveLoose, onClear, disabled }: Props) {
  const hasCarrier = !!(activeCode || "").trim();

  return (
    <div className="flex items-center gap-3 bg-amber-50 border border-amber-200/60 px-4 py-1.5 rounded-xl shadow-sm">
      <Box size={18} className="text-amber-600 shrink-0 hidden sm:block" />
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-bold text-amber-700/70 leading-none mb-1 uppercase tracking-wider">
          Aktywny nośnik
        </span>
        <div className="flex items-center gap-2">
          {hasCarrier ? (
            <ReceivingCarrierBadge code={activeCode!} className="text-[13px]" />
          ) : (
            <span className="text-sm font-bold text-amber-900 leading-none truncate">
              Luzem (brak nośnika)
            </span>
          )}
        </div>
      </div>
      
      {/* Przyciski akcji - kompaktowe */}
      <div className="flex items-center gap-2 pl-3 ml-1 border-l border-amber-200/50">
        <button
          type="button"
          disabled={disabled}
          onClick={onReceiveLoose}
          className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100 border border-amber-200 shadow-sm disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          Luzem
        </button>
        {hasCarrier && (
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 shadow-sm disabled:opacity-50 transition-colors"
          >
            Wyczyść
          </button>
        )}
      </div>
    </div>
  );
}