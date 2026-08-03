import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { NextAfterView, WorkStepView } from "../utils/shiftBoard";

function statusClass(key: string): string {
  switch (key) {
    case "READY":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "IN_PROGRESS":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "DONE":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "BLOCKED":
      return "bg-orange-50 text-orange-900 border-orange-200";
    case "FAILED":
      return "bg-rose-50 text-rose-800 border-rose-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

type Props = {
  nextAfter: NextAfterView;
  steps: WorkStepView[];
};

export function ShiftNextAfter({ nextAfter, steps }: Props) {
  const [open, setOpen] = useState(false);
  if (!nextAfter && !steps.length) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {nextAfter ? (
        <div className="px-4 py-3.5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
            Następne po zakończeniu tego zadania
          </p>
          <p className="text-sm font-black text-slate-900 mt-1">{nextAfter.title}</p>
        </div>
      ) : null}

      {steps.length > 0 ? (
        <>
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-left border-t border-slate-100"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="text-sm font-bold text-slate-700">Szczegóły planu</span>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {open ? (
            <ol className="divide-y divide-slate-100 border-t border-slate-100">
              {steps.map((s) => (
                <li key={s.seq} className="px-4 py-3.5 flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white text-xs font-black">
                    {s.seq}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-slate-900">{s.title}</p>
                      <span
                        className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded border ${statusClass(s.statusKey)}`}
                      >
                        {s.statusLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Cel: <span className="font-semibold text-slate-700">{s.goal}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
