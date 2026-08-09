/**
 * Statyczny podgląd układu „Standardowy” w ustawieniach WMS (bez logiki pakowania).
 * Odwzorowuje karty jak na liście zamówień w trybie pakowania.
 */
export function StandardOrdersListLayoutPreview() {
  const cards: Array<{
    number: string;
    packed: number;
    total: number;
    fa?: boolean;
    customer?: string;
    carrier: "dpd" | "inpost" | "ups" | "dachser" | "pickup";
    done?: boolean;
  }> = [
    { number: "798545", packed: 1, total: 5, fa: true, customer: "Jan Nowak", carrier: "dpd" },
    { number: "798546", packed: 0, total: 5, fa: true, carrier: "inpost" },
    { number: "798547", packed: 0, total: 3, fa: true, customer: "Anna Kowalska", carrier: "ups" },
    { number: "798548", packed: 2, total: 4, fa: true, carrier: "dachser" },
    { number: "798549", packed: 0, total: 2, fa: true, carrier: "pickup" },
    { number: "798550", packed: 5, total: 5, fa: true, done: true, carrier: "dpd" },
  ];

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-600">Podgląd układu:</p>
      <p className="mb-3 text-sm font-bold text-slate-900">Standardowy</p>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {cards.map((c) => (
          <PreviewCard key={c.number} {...c} />
        ))}
      </div>
    </div>
  );
}

function PreviewCard({
  number,
  packed,
  total,
  fa,
  customer,
  carrier,
  done,
}: {
  number: string;
  packed: number;
  total: number;
  fa?: boolean;
  customer?: string;
  carrier: "dpd" | "inpost" | "ups" | "dachser" | "pickup";
  done?: boolean;
}) {
  const labelCls = "text-[8px] font-semibold uppercase tracking-[0.06em] text-slate-400";
  const muted = done ? "opacity-45 grayscale" : "";

  return (
    <div className="flex min-h-[4.75rem] flex-col rounded-lg border border-slate-200 bg-white px-2 py-2">
      {done ? (
        <div className="mb-1 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#4CAF50] text-[10px] text-white">
              ✓
            </span>
            <span className="text-[10px] font-semibold text-slate-500">
              Spakowane {packed}/{total}
            </span>
          </div>
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#E53935] text-[10px] text-white">
            ×
          </span>
        </div>
      ) : null}
      <div className="grid min-w-0 grid-cols-[minmax(0,1.2fr)_auto_minmax(3.25rem,4.5rem)] items-start gap-x-1.5">
        <div className={`min-w-0 ${muted}`}>
          <div className={labelCls}>Nr zamówienia</div>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="text-sm font-extrabold tabular-nums leading-none text-slate-900">{number}</span>
            {fa ? (
              <span className="rounded bg-[#4CAF50] px-0.5 py-px text-[8px] font-bold text-white">Fa</span>
            ) : null}
          </div>
          {customer ? (
            <p className="mt-1 truncate text-[9px] text-slate-500">
              <span className="mr-0.5 inline-block h-1 w-1 rounded-full bg-emerald-500" />
              {customer}
            </p>
          ) : null}
        </div>
        <div className={`min-w-[2.25rem] ${muted}`}>
          <div className={labelCls}>Spakowano</div>
          <div className="mt-0.5 text-base font-extrabold tabular-nums leading-none text-slate-900">
            {packed}/{total}
          </div>
        </div>
        <div className={`flex min-h-[2rem] items-center justify-end self-center ${muted}`}>
          <CarrierPreviewMark carrier={carrier} />
        </div>
      </div>
    </div>
  );
}

function CarrierPreviewMark({ carrier }: { carrier: "dpd" | "inpost" | "ups" | "dachser" | "pickup" }) {
  if (carrier === "pickup") {
    return (
      <div className="flex flex-col items-end text-right">
        <svg width="22" height="22" viewBox="0 0 48 48" fill="none" className="text-slate-800" aria-hidden>
          <circle cx="24" cy="12" r="6" stroke="currentColor" strokeWidth="2.2" />
          <path d="M12 36c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="30" y="28" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="max-w-[3.5rem] text-[7px] font-extrabold uppercase leading-tight text-slate-900">
          Odbiór osobisty
        </span>
      </div>
    );
  }
  if (carrier === "dpd") {
    return <img src="/assets/carriers/dpd.svg" alt="" className="max-h-6 w-auto max-w-[3.5rem] object-contain" />;
  }
  if (carrier === "inpost") {
    return <img src="/assets/carriers/inpost.svg" alt="" className="max-h-6 w-auto max-w-[3.5rem] object-contain" />;
  }
  if (carrier === "ups") {
    return (
      <span className="rounded bg-[#351C15] px-1.5 py-0.5 text-[9px] font-black tracking-wide text-[#FFB500]">
        UPS
      </span>
    );
  }
  return (
    <span className="text-[8px] font-extrabold uppercase leading-tight tracking-tight text-[#003399]">
      DACHSER
    </span>
  );
}
