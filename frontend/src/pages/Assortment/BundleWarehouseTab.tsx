import { ProductLikeSection } from "../../components/catalog";
import type { BundleComponentRow, ProductSummary } from "./bundleEditTypes";

type Props = {
  rows: BundleComponentRow[];
  productCache: Record<number, ProductSummary>;
  bundleAvailability: number | null;
};

export function BundleWarehouseTab({ rows, productCache, bundleAvailability }: Props) {
  const components = rows.filter((r) => r.productId != null);

  return (
    <div className="w-full max-w-5xl space-y-8">
      <ProductLikeSection title="Dostępność wynikająca ze składników">
        <p className="text-sm text-slate-700">
          Zestaw nie ma własnego stanu magazynowego. Możesz zbudować tyle zestawów, ile pozwala najsłabszy składnik
          (minimum z ilorazów: stan ÷ ilość w zestawie).
        </p>
        <p className="mt-4 text-3xl font-bold tabular-nums text-slate-900">
          {bundleAvailability != null ? `${bundleAvailability} zest.` : "—"}
        </p>
      </ProductLikeSection>

      <ProductLikeSection title="Składniki — stany magazynowe">
        {components.length === 0 ? (
          <p className="text-sm text-slate-500">Dodaj produkty w zakładce Produkty.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[36rem] text-sm text-left">
              <thead className="border-b border-slate-200 bg-white text-xs font-semibold text-slate-700">
                <tr>
                  <th className="px-5 py-3.5">Produkt</th>
                  <th className="px-5 py-3.5 text-right">Stan magazynowy</th>
                  <th className="px-5 py-3.5 text-right">Ilość w zestawie</th>
                  <th className="px-5 py-3.5 text-right">Maks. liczba zestawów</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600">
                {components.map((r) => {
                  const c = productCache[r.productId!];
                  const qty = Math.max(1, Math.floor(r.quantity));
                  const stock = c?.stock ?? 0;
                  const maxBundles = Math.floor(stock / qty);
                  return (
                    <tr key={r.rowKey}>
                      <td className="px-5 py-3.5 font-medium text-slate-900">{c?.name ?? `#${r.productId}`}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">{stock}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">{qty}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-900">{maxBundles}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ProductLikeSection>
    </div>
  );
}
