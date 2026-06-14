import type { BundleComponentRow, ProductSummary } from "../bundleEditTypes";

type Props = {
  rows: BundleComponentRow[];
  productCache: Record<number, ProductSummary>;
};

/** Receptura produkcyjna zestawu — tylko odczyt ze składników (zakładka Produkty). */
export function BundleProductionRecipeTable({ rows, productCache }: Props) {
  const lines = rows.filter((r) => r.productId != null);

  if (lines.length === 0) {
    return <p className="text-sm text-slate-500">Dodaj składniki w zakładce Produkty.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[40rem] text-sm text-left">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
          <tr>
            <th className="px-5 py-3.5">Produkt</th>
            <th className="px-5 py-3.5">SKU</th>
            <th className="px-5 py-3.5">EAN</th>
            <th className="px-5 py-3.5 text-right">Ilość</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600">
          {lines.map((r) => {
            const c = productCache[r.productId!];
            const qty = Math.max(1, Math.floor(r.quantity));
            return (
              <tr key={r.rowKey}>
                <td className="px-5 py-3.5 font-medium text-slate-900">{c?.name ?? `Produkt #${r.productId}`}</td>
                <td className="px-5 py-3.5 font-mono text-xs text-slate-700">{(c?.sku ?? "").trim() || "—"}</td>
                <td className="px-5 py-3.5 font-mono text-xs text-slate-700">{(c?.ean ?? "").trim() || "—"}</td>
                <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-900">{qty}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
