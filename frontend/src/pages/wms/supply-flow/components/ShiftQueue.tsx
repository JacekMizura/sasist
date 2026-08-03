import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { QueueCardView } from "../utils/shiftBoard";
import { markLeavingForWork, urgencyBandClass } from "../utils/shiftBoard";

type Props = {
  items: QueueCardView[];
  remainingAfterQueue: number;
};

export function ShiftQueue({ items, remainingAfterQueue }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (!items.length && remainingAfterQueue <= 0) return null;

  return (
    <section>
      <h3 className="text-sm font-black text-slate-900 mb-3">Co dalej</h3>
      <ul className="space-y-3">
        {items.map((item, idx) => {
          const open = openId === item.deliveryId;
          return (
            <li
              key={item.deliveryId}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <button
                type="button"
                className="w-full text-left px-4 py-3.5 flex flex-wrap items-start justify-between gap-3 hover:bg-slate-50/80"
                onClick={() => setOpenId(open ? null : item.deliveryId)}
              >
                <div className="min-w-0 flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-600">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.supplier}
                      {" · "}
                      {item.documentLabel}
                    </p>
                    <p className="text-xs font-semibold text-slate-700 mt-1">{item.effectLine}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-md border ${urgencyBandClass(item.urgencyBand)}`}
                  >
                    {item.urgencyLabel}
                  </span>
                  {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {open ? (
                <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/50">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-3 mb-2">
                    Szczegóły
                  </p>
                  <p className="text-xs text-slate-500 mb-2">{item.phaseLabel}</p>
                  {item.why.length > 0 ? (
                    <ul className="space-y-1 mb-3">
                      {item.why.map((w, i) => (
                        <li key={i} className="text-xs text-slate-700">
                          • {w.charAt(0).toUpperCase()}
                          {w.slice(1)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <Link
                    to={item.ctaHref}
                    onClick={() =>
                      markLeavingForWork({
                        leftAt: Date.now(),
                        title: item.title,
                        deliveryId: item.deliveryId,
                      })
                    }
                    className="inline-flex rounded-lg bg-slate-900 text-white px-3 py-2 text-xs font-black hover:bg-slate-800"
                  >
                    {item.ctaLabel}
                  </Link>
                </div>
              ) : (
                <div className="px-4 pb-3">
                  <Link
                    to={item.ctaHref}
                    onClick={() =>
                      markLeavingForWork({
                        leftAt: Date.now(),
                        title: item.title,
                        deliveryId: item.deliveryId,
                      })
                    }
                    className="text-xs font-black text-orange-700 hover:text-orange-800"
                  >
                    {item.ctaLabel} →
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {remainingAfterQueue > 0 ? (
        <p className="mt-3 text-xs font-semibold text-slate-500">
          + jeszcze {remainingAfterQueue}{" "}
          {remainingAfterQueue === 1 ? "dostawa oczekuje" : "dostaw oczekuje"}
        </p>
      ) : null}
    </section>
  );
}
