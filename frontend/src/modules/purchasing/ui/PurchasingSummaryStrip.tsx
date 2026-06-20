import { memo, type ReactNode } from "react";

export type PurchasingSummaryItem = {
  label: string;
  value: ReactNode;
  hint?: string;
};

type Props = {
  items: PurchasingSummaryItem[];
  className?: string;
};

/** Poziomy pasek statystyk — kompaktowe podsumowanie między filtrami a tabelą. */
function PurchasingSummaryStripInner({ items, className = "" }: Props) {
  return (
    <div
      className={`flex flex-wrap gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm ${className}`.trim()}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-[8rem]">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{item.value}</div>
          {item.hint ? <p className="mt-0.5 text-[11px] text-slate-500">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

export const PurchasingSummaryStrip = memo(PurchasingSummaryStripInner);
