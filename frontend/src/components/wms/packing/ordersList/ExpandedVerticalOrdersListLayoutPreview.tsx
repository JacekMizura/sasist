/**
 * Pełny podgląd układu „Rozbudowany (Pionowy)” w ustawieniach WMS.
 */
export function ExpandedVerticalOrdersListLayoutPreview() {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold text-slate-600">Podgląd układu:</p>
      <p className="mb-3 text-sm font-bold text-slate-900">Rozbudowany (Pionowy)</p>

      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-700">
          ‹
        </span>
        <span className="text-sm font-bold text-slate-900">Zamówień: 6</span>
        <span className="rounded-full bg-[#4CAF50] px-2.5 py-1 text-[11px] font-bold text-white">Spakowane: 2</span>
        <span className="rounded-full bg-[#FF9800] px-2.5 py-1 text-[11px] font-bold text-white">W trakcie: 1</span>
        <span className="rounded-full bg-[#E53935] px-2.5 py-1 text-[11px] font-bold text-white">Braki: 1</span>
      </div>

      <div className="space-y-3 bg-white">
        <PreviewCard
          number="2158"
          packed={1}
          total={10}
          fa
          products={[
            { qty: 1, name: "Bawełniany T-shirt męski ETHAN", ean: "5904567890123", color: "zielony", packed: true },
            { qty: 4, name: "Skarpety sport", ean: "5904567890456", color: "czarny" },
            { qty: 1, name: "Czapka beanie", ean: "5904567890789", color: "szary" },
          ]}
          overflow={5}
        />
        <PreviewCard
          number="2160"
          packed={0}
          total={1}
          fa
          products={[{ qty: 1, name: "Torba shopper", ean: "5904567890111", color: "beżowy" }]}
        />
        <PreviewCard
          number="2162"
          packed={0}
          total={3}
          fa
          products={[
            { qty: 2, name: "Koszulka basic", ean: "5904567890222", color: "biały" },
            { qty: 1, name: "Pasek skórzany", ean: "5904567890333", color: "brązowy" },
          ]}
          overflow={2}
        />
      </div>
    </div>
  );
}

function PreviewCard({
  number,
  packed,
  total,
  fa,
  products,
  overflow,
}: {
  number: string;
  packed: number;
  total: number;
  fa?: boolean;
  products: Array<{ qty: number; name: string; ean: string; color?: string; packed?: boolean }>;
  overflow?: number;
}) {
  const labelCls = "text-[8px] font-semibold uppercase tracking-[0.06em] text-slate-400";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
      <div className="grid grid-cols-[minmax(0,1.3fr)_auto_minmax(3.5rem,5rem)] gap-x-3">
        <div className={labelCls}>Nr zamówienia</div>
        <div className={labelCls}>Spakowano</div>
        <div />
        <div className="flex items-center gap-1">
          <span className="text-base font-extrabold tabular-nums text-slate-900">{number}</span>
          {fa ? (
            <span className="rounded bg-[#42A5F5] px-1 py-px text-[8px] font-bold text-white">Fa</span>
          ) : null}
        </div>
        <div className="text-base font-extrabold tabular-nums text-slate-900">
          {packed}/{total}
        </div>
        <div className="flex items-center justify-end">
          <img src="/assets/carriers/dpd.svg" alt="" className="max-h-5 w-auto max-w-[2.75rem] object-contain" />
        </div>
      </div>
      <div className="mt-2 flex overflow-hidden">
        {products.map((p, i) => (
          <div
            key={p.ean}
            className={[
              "flex min-w-[10rem] max-w-[14rem] shrink-0 gap-2 py-1 pr-3",
              i < products.length - 1 || overflow ? "border-r border-slate-200" : "",
              p.packed ? "opacity-55" : "",
            ].join(" ")}
          >
            <div className="h-10 w-10 shrink-0 rounded bg-slate-100" />
            <div className="min-w-0">
              {p.packed ? (
                <div className="mb-0.5 flex items-center gap-1 text-[9px] font-semibold text-[#4CAF50]">
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#4CAF50] text-[8px] text-white">
                    ✓
                  </span>
                  Spakowane 1/1
                </div>
              ) : null}
              <p className="truncate text-[11px] text-slate-900">
                <span className="font-extrabold">{p.qty}x</span> {p.name}
              </p>
              <p className="truncate text-[9px] text-slate-500">EAN: {p.ean}</p>
              {p.color ? <p className="truncate text-[9px] text-slate-500">Kolor: {p.color}</p> : null}
            </div>
          </div>
        ))}
        {overflow ? (
          <div className="flex shrink-0 items-center pl-2">
            <span className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-800">
              +{overflow} innych
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
