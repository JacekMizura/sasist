export type IntakeComponentRow = {
  key: string | number;
  name: string;
  sku: string | null;
  perUnit: number;
  expected: number;
  accepted: number;
  scrap: number;
};

type Props = {
  title: string;
  /** e.g. "20 szt." or "1 zestawu" */
  manyQtyLabel: string;
  perUnitSuffix: string;
  rows: IntakeComponentRow[];
  disabled?: boolean;
  onAcceptedChange?: (key: string | number, accepted: number) => void;
};

export function IntakeComponentRows({
  title,
  manyQtyLabel,
  perUnitSuffix,
  rows,
  disabled = false,
  onAcceptedChange,
}: Props) {
  if (rows.length < 1) return null;

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <h4 className="border-b border-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">{title}</h4>
      <ul className="divide-y divide-slate-100">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center justify-between gap-3 px-2.5 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium leading-snug text-slate-900">{row.name}</p>
              <p className="mt-0.5 truncate text-[11px] leading-snug text-slate-500">
                {row.sku ? <span className="font-mono">SKU {row.sku}</span> : null}
                {row.sku ? <span className="mx-1.5 text-slate-300">·</span> : null}
                <span className="tabular-nums">
                  {row.perUnit} {perUnitSuffix}
                </span>
                <span className="mx-1.5 text-slate-300">·</span>
                <span>
                  Dla {manyQtyLabel} →{" "}
                  <span className="font-semibold tabular-nums text-slate-800">{row.expected} szt.</span>
                </span>
              </p>
            </div>
            {!disabled ? (
              <div className="flex shrink-0 items-center gap-2.5 text-[11px] text-slate-700">
                <label className="inline-flex items-center gap-1">
                  <span className="whitespace-nowrap">Przyjmij na stan</span>
                  <input
                    type="number"
                    min={0}
                    max={row.expected}
                    step={1}
                    value={row.accepted}
                    onChange={(e) => onAcceptedChange?.(row.key, Number(e.target.value))}
                    className="h-7 w-12 rounded border border-slate-200 bg-white px-1 text-right tabular-nums text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                </label>
                <label className="inline-flex items-center gap-1">
                  <span>Odrzut</span>
                  <input
                    type="number"
                    min={0}
                    max={row.expected}
                    step={1}
                    value={row.scrap}
                    onChange={(e) => {
                      const scrap = Math.max(0, Math.min(row.expected, Math.floor(Number(e.target.value) || 0)));
                      onAcceptedChange?.(row.key, Math.max(0, row.expected - scrap));
                    }}
                    className="h-7 w-11 rounded border border-slate-200 bg-white px-1 text-right tabular-nums text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                </label>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
