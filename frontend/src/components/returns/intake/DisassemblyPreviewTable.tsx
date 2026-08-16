import { ChevronDown } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

export type DisassemblyPreviewRow = {
  key: string | number;
  name: string;
  sku: string | null;
  ratioLabel: string;
  perOneLabel: string;
  perManyLabel: string;
  availableLabel: string;
  detail?: ReactNode;
};

type Props = {
  title: string;
  headers: {
    name: string;
    sku: string;
    ratio: string;
    perOne: string;
    perMany: string;
    available: string;
    action: string;
  };
  manyQty: number;
  rows: DisassemblyPreviewRow[];
  defaultOpen?: boolean;
};

export function DisassemblyPreviewTable({
  title,
  headers,
  manyQty,
  rows,
  defaultOpen = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [openDetailKey, setOpenDetailKey] = useState<string | number | null>(null);
  const perManyHeader = headers.perMany.replace("{n}", String(manyQty));

  if (rows.length < 1) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-full text-left text-[12px]">
            <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">{headers.name}</th>
                <th className="px-3 py-2 font-semibold">{headers.sku}</th>
                <th className="px-3 py-2 font-semibold">{headers.ratio}</th>
                <th className="px-3 py-2 font-semibold">{headers.perOne}</th>
                <th className="px-3 py-2 font-semibold">{perManyHeader}</th>
                <th className="px-3 py-2 font-semibold">{headers.available}</th>
                <th className="px-3 py-2 font-semibold">{headers.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const detailOpen = openDetailKey === row.key;
                return (
                  <Fragment key={row.key}>
                    <tr className="text-slate-800">
                      <td className="px-3 py-2 font-medium text-slate-900">{row.name}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{row.sku || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{row.ratioLabel}</td>
                      <td className="px-3 py-2 tabular-nums">{row.perOneLabel}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold">{row.perManyLabel}</td>
                      <td className="px-3 py-2 tabular-nums text-emerald-700">{row.availableLabel}</td>
                      <td className="px-3 py-2">
                        {row.detail ? (
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                            onClick={() => setOpenDetailKey(detailOpen ? null : row.key)}
                          >
                            {detailOpen ? "Ukryj" : "Pokaż szczegóły"}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                    {detailOpen && row.detail ? (
                      <tr className="bg-slate-50/80">
                        <td colSpan={7} className="px-3 py-2">
                          {row.detail}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
