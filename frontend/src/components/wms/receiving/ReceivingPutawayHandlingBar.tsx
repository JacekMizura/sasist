type Props = {
  requiresPutaway: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (requiresPutaway: boolean) => void;
};

/**
 * Sposób obsługi po przyjęciu — STANDARD vs BEZ ROZLOKOWANIA (SSOT: requires_putaway).
 */
export function ReceivingPutawayHandlingBar({
  requiresPutaway,
  disabled = false,
  busy = false,
  onChange,
}: Props) {
  return (
    <div className="w-full px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2 sm:gap-3">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
        Po przyjęciu
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => onChange(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
            requiresPutaway
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"
          }`}
        >
          Standardowe — rozlokuj w magazynie
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => onChange(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
            !requiresPutaway
              ? "bg-amber-600 text-white border-amber-600"
              : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"
          }`}
        >
          Bez rozlokowania
        </button>
      </div>
    </div>
  );
}
