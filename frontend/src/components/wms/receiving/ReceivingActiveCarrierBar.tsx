import { Box } from "lucide-react";
import { carrierVisualClasses } from "../../warehouse/carriers/carrierConstants";
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
    <div className={`flex items-center gap-3 rounded-xl px-4 py-1.5 shadow-sm ${carrierVisualClasses.bar}`}>
      <Box size={18} className={`hidden shrink-0 sm:block ${carrierVisualClasses.barIcon}`} />
      <div className="flex min-w-0 flex-col">
        <span
          className={`mb-1 text-[10px] font-bold uppercase leading-none tracking-wider ${carrierVisualClasses.barLabel}`}
        >
          Aktywny nośnik
        </span>
        <div className="flex items-center gap-2">
          {hasCarrier ? (
            <ReceivingCarrierBadge code={activeCode!} className="text-[13px]" />
          ) : (
            <span className="truncate text-sm font-bold leading-none text-slate-700">Luzem (brak nośnika)</span>
          )}
        </div>
      </div>

      <div className={`ml-1 flex items-center gap-2 border-l pl-3 ${carrierVisualClasses.barDivider}`}>
        <button type="button" disabled={disabled} onClick={onReceiveLoose} className={carrierVisualClasses.barAction}>
          Luzem
        </button>
        {hasCarrier ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Wyczyść
          </button>
        ) : null}
      </div>
    </div>
  );
}
