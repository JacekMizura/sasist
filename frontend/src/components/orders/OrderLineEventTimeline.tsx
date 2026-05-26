import { useState } from "react";
import type { LogicalOrderEvent } from "./logicalOrderItems";

type Props = {
  events: LogicalOrderEvent[];
  formatDetailDate: (iso: string) => string;
  defaultOpen?: boolean;
};

const KIND_STYLE: Record<string, string> = {
  shortage_reduced: "text-amber-900",
  order_line_removed: "text-rose-900",
  replacement: "text-indigo-900",
  panel_note: "text-slate-700",
};

export function OrderLineEventTimeline({ events, formatDetailDate, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  if (events.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Historia linii ({events.length})</span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <ol className="mt-2 space-y-2 border-t border-slate-200/80 pt-2">
          {events.map((ev) => (
            <li key={ev.id} className="text-xs">
              {ev.at ? (
                <p className="text-[10px] font-medium text-slate-500">{formatDetailDate(ev.at)}</p>
              ) : null}
              <p className={`font-semibold ${KIND_STYLE[ev.kind] ?? "text-slate-800"}`}>{ev.label}</p>
              {ev.detail ? <p className="mt-0.5 text-slate-600">{ev.detail}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
