import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { markLeavingForWork } from "../utils/shiftBoard";

type Props = {
  completedTitle: string;
  nextTitle: string;
  ctaLabel: string;
  ctaHref: string;
  onDismiss: () => void;
};

export function ShiftReturnBanner({
  completedTitle,
  nextTitle,
  ctaLabel,
  ctaHref,
  onDismiss,
}: Props) {
  return (
    <section className="rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50 via-white to-orange-50 p-5 sm:p-7 shadow-sm">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={28} strokeWidth={2.5} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-emerald-800">Zadanie zakończone.</p>
          <p className="text-xs text-slate-600 mt-1">{completedTitle}</p>
          <p className="text-[11px] font-black uppercase tracking-widest text-orange-700 mt-4">
            Następne zadanie
          </p>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
            {nextTitle}
          </h2>
          <Link
            to={ctaHref}
            onClick={() => {
              onDismiss();
              markLeavingForWork({
                leftAt: Date.now(),
                title: nextTitle,
                deliveryId: null,
              });
            }}
            className="mt-5 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-5 py-3.5 text-base font-black shadow-sm"
          >
            {ctaLabel}
            <ArrowRight size={18} strokeWidth={2.5} />
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="mt-3 block text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Pokaż pełną kolejkę
          </button>
        </div>
      </div>
    </section>
  );
}
