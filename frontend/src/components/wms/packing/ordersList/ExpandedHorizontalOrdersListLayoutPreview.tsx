/**
 * Pełny podgląd układu „Rozbudowany (Poziomy)” w ustawieniach WMS — jak mock listy.
 */
export function ExpandedHorizontalOrdersListLayoutPreview() {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold text-slate-600">Podgląd układu:</p>
      <p className="mb-3 text-sm font-bold text-slate-900">Rozbudowany (Poziomy)</p>

      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-700">
          ‹
        </span>
        <span className="text-sm font-bold text-slate-900">Zamówień: 6</span>
        <span className="rounded-full bg-[#4CAF50] px-2.5 py-1 text-[11px] font-bold text-white">Spakowane: 2</span>
        <span className="rounded-full bg-[#FF9800] px-2.5 py-1 text-[11px] font-bold text-white">W trakcie: 1</span>
        <span className="rounded-full bg-[#E53935] px-2.5 py-1 text-[11px] font-bold text-white">Braki: 1</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
        <PreviewCard
          number="2158"
          packed={1}
          total={2}
          carrier="dpd"
          shortage
          lines={[
            {
              qty: 4,
              name: "Elegancka listonoszka damska",
              ean: "5901234567890",
              color: "czarny",
              shortage: "1/4",
              packedLabel: "1/1",
            },
            { qty: 1, name: "Pasek skórzany", ean: "5901234567801", color: "brązowy" },
          ]}
        />
        <PreviewCard
          number="2160"
          packed={0}
          total={3}
          carrier="ups"
          lines={[
            { qty: 2, name: "Torba shopper", ean: "5901234567812", color: "beżowy" },
            { qty: 1, name: "Portfel męski", ean: "5901234567823", color: "czarny" },
          ]}
        />
        <PreviewCard
          number="2162"
          packed={0}
          total={8}
          carrier="pickup"
          lines={[
            { qty: 1, name: "Koszulka basic", ean: "5901234567834", color: "biały" },
            { qty: 3, name: "Skarpety sport", ean: "5901234567845", color: "szary" },
          ]}
          overflow={5}
        />
        <PreviewCard
          number="2165"
          packed={2}
          total={2}
          carrier="dpd"
          done
          lines={[
            { qty: 1, name: "Plecak miejski", ean: "5901234567856", color: "granat", packedLabel: "1/1" },
            { qty: 1, name: "Bidon 0.7l", ean: "5901234567867", color: "zielony", packedLabel: "1/1" },
          ]}
        />
      </div>
    </div>
  );
}

type PreviewLine = {
  qty: number;
  name: string;
  ean: string;
  color?: string;
  shortage?: string;
  packedLabel?: string;
};

function PreviewCard({
  number,
  packed,
  total,
  carrier,
  lines,
  shortage,
  done,
  overflow,
}: {
  number: string;
  packed: number;
  total: number;
  carrier: "dpd" | "ups" | "pickup";
  lines: PreviewLine[];
  shortage?: boolean;
  done?: boolean;
  overflow?: number;
}) {
  const labelCls = "text-[8px] font-semibold uppercase tracking-[0.06em] text-slate-400";
  return (
    <div
      className={[
        "flex w-[15.5rem] shrink-0 flex-col rounded-lg bg-white px-3 py-2.5",
        shortage && !done ? "border border-[#E53935]" : "border border-slate-200",
        done ? "opacity-[0.52]" : "",
      ].join(" ")}
    >
      <div className="grid grid-cols-[minmax(0,1.1fr)_auto_minmax(3rem,4.5rem)] gap-x-1.5">
        <div className={labelCls}>Nr zamówienia</div>
        <div className={`${labelCls} text-center`}>Spakowano</div>
        <div />
        <div className="text-base font-extrabold tabular-nums leading-none text-slate-900">{number}</div>
        <div className="text-center">
          {done ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#4CAF50] text-[8px] text-white">
                ✓
              </span>
              Spakowane {packed}/{total}
            </span>
          ) : (
            <span className="text-base font-extrabold tabular-nums leading-none text-slate-900">
              {packed}/{total}
            </span>
          )}
        </div>
        <div className="flex items-center justify-end">
          <CarrierMark carrier={carrier} />
        </div>
      </div>

      <div className="mt-1.5 border-t border-slate-100">
        {lines.map((l) => (
          <div key={l.ean} className="flex gap-2 border-b border-slate-100 py-2 last:border-b-0">
            <div className="h-10 w-10 shrink-0 rounded bg-slate-100" />
            <div className="min-w-0 flex-1">
              {l.packedLabel ? (
                <div className="mb-0.5 flex items-center justify-between gap-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#4CAF50] text-[8px] text-white">
                      ✓
                    </span>
                    Spakowane {l.packedLabel}
                  </span>
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#E53935] text-[8px] text-white">
                    ×
                  </span>
                </div>
              ) : null}
              <p className="truncate text-[11px] text-slate-900">
                <span className="font-extrabold">{l.qty}x</span> {l.name}
              </p>
              <p className="truncate text-[9px] text-slate-500">EAN: {l.ean}</p>
              {l.color ? <p className="truncate text-[9px] text-slate-500">Kolor: {l.color}</p> : null}
              {l.shortage ? (
                <span className="mt-1 inline-flex rounded bg-[#E53935] px-1 py-px text-[9px] font-bold text-white">
                  Brak {l.shortage}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        {overflow ? (
          <div className="flex justify-end pt-1.5">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700">
              +{overflow} innych
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CarrierMark({ carrier }: { carrier: "dpd" | "ups" | "pickup" }) {
  if (carrier === "pickup") {
    return (
      <span className="max-w-[3.25rem] text-right text-[7px] font-extrabold uppercase leading-tight text-slate-900">
        Odbiór osobisty
      </span>
    );
  }
  if (carrier === "ups") {
    return (
      <span className="rounded bg-[#351C15] px-1 py-0.5 text-[8px] font-black text-[#FFB500]">UPS</span>
    );
  }
  return <img src="/assets/carriers/dpd.svg" alt="" className="max-h-5 w-auto max-w-[2.75rem] object-contain" />;
}
