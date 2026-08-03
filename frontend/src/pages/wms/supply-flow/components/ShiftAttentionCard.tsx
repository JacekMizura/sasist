import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { AttentionView } from "../utils/shiftBoard";
import { markLeavingForWork } from "../utils/shiftBoard";

type Props = { attention: AttentionView };

export function ShiftAttentionCard({ attention }: Props) {
  const onGo = () => {
    markLeavingForWork({
      leftAt: Date.now(),
      title: attention.title,
      deliveryId: attention.deliveryId,
    });
  };

  return (
    <section className="rounded-2xl border-2 border-orange-400 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-5 sm:p-7 shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-widest text-orange-700 mb-2">
        Co wymaga uwagi
      </p>
      <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
        {attention.title}
      </h2>

      {attention.whyBullets.length > 0 ? (
        <>
          <p className="mt-4 text-xs font-black uppercase tracking-widest text-slate-500">Dlaczego?</p>
          <ul className="mt-2 space-y-1.5">
            {attention.whyBullets.slice(0, 2).map((b, i) => (
              <li key={i} className="text-sm text-slate-700 flex gap-2">
                <span className="text-orange-500 font-black">•</span>
                <span>
                  {b.charAt(0).toUpperCase()}
                  {b.slice(1)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {attention.blockedReason ? (
        <p className="mt-3 text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {attention.blockedReason}
        </p>
      ) : null}

      <Link
        to={attention.ctaHref}
        onClick={onGo}
        className="mt-6 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-5 py-3.5 text-base font-black shadow-sm transition-colors"
      >
        {attention.ctaLabel}
        <ArrowRight size={18} strokeWidth={2.5} />
      </Link>
    </section>
  );
}
