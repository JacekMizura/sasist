import type { BundleComponentRow, ProductSummary } from "../../Assortment/bundleEditTypes";

type Props = {
  rows: BundleComponentRow[];
  productCache: Record<number, ProductSummary>;
  maxBundles: number | null;
  showMaxSummary?: boolean;
};

/** Tabela składników kompletacji — współdzielona (Produkcja + Magazyn). */
export function AssemblyComponentsTable({
  rows,
  productCache,
  maxBundles,
  showMaxSummary = true,
}: Props) {
  const components = rows.filter((r) => r.productId != null);

  if (components.length === 0) {
    return <p className="text-sm text-slate-500">Dodaj produkty w zakładce Produkty.</p>;
  }

  return (
    <div className="space-y-4">
      {showMaxSummary && maxBundles != null ? (
        <p className="text-sm text-slate-700">
          Maksymalnie można złożyć:{" "}
          <span className="text-lg font-bold tabular-nums text-slate-900">{maxBundles} zest.</span>
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[36rem] text-sm text-left">
          <thead className="border-b border-slate-200 bg-white text-xs font-semibold text-slate-700">
            <tr>
              <th className="px-5 py-3.5">Produkt</th>
              <th className="px-5 py-3.5 text-right">Stan</th>
              <th className="px-5 py-3.5 text-right">Ilość</th>
              <th className="px-5 py-3.5 text-right">Maks. liczba zestawów</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600">
            {components.map((r) => {
              const c = productCache[r.productId!];
              const qty = Math.max(1, Math.floor(r.quantity));
              const stock = c?.stock ?? 0;
              const per = Math.floor(stock / qty);
              return (
                <tr key={r.rowKey}>
                  <td className="px-5 py-3.5 font-medium text-slate-900">{c?.name ?? `#${r.productId}`}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{stock}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">×{qty}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-900">{per}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
