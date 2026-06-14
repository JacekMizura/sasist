import { ProductLikeSection, productLikeNumericInputNoSpinnerClass } from "../../components/catalog";
import { BundleProductSearch } from "./BundleProductSearch";
import type { BundleComponentRow, CatalogProduct, ProductSummary } from "./bundleEditTypes";

type Props = {
  tenantId: number;
  rows: BundleComponentRow[];
  productCache: Record<number, ProductSummary>;
  onPick: (p: CatalogProduct) => void;
  onQuantity: (rowIndex: number, q: number) => void;
  onRemove: (rowIndex: number) => void;
  mergeProductIntoCache: (p: CatalogProduct) => void;
};

function thumb(url: string | null | undefined) {
  const u = (url ?? "").trim();
  if (!u) return <span className="text-[10px] text-slate-400">—</span>;
  return <img src={u} alt="" className="mx-auto max-h-12 max-w-[3rem] object-contain" />;
}

export function BundleProductsTab({
  tenantId,
  rows,
  productCache,
  onPick,
  onQuantity,
  onRemove,
  mergeProductIntoCache,
}: Props) {
  const filled = rows
    .map((row, index) => ({ row, index }))
    .filter((x) => x.row.productId != null);

  return (
    <div className="w-full space-y-6">
      <ProductLikeSection title="Skład zestawu">
        <p className="mb-4 text-sm text-slate-600">
          Wyszukaj produkt po nazwie, SKU lub EAN. Duplikaty są scalane przy zapisie.
        </p>
        <BundleProductSearch tenantId={tenantId} onPick={onPick} mergeProductIntoCache={mergeProductIntoCache} />
      </ProductLikeSection>

      <ProductLikeSection title="Produkty w zestawie">
        {filled.length === 0 ? (
          <p className="text-sm text-slate-500">Brak produktów — użyj wyszukiwarki powyżej.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[40rem] text-sm text-left">
              <thead className="border-b border-slate-200 bg-white text-xs font-semibold text-slate-700">
                <tr>
                  <th className="w-16 px-4 py-3.5 text-center">Zdjęcie</th>
                  <th className="px-4 py-3.5">Produkt</th>
                  <th className="px-4 py-3.5">SKU</th>
                  <th className="px-4 py-3.5">EAN</th>
                  <th className="w-24 px-4 py-3.5 text-right">Ilość</th>
                  <th className="w-28 px-4 py-3.5 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600">
                {filled.map(({ row, index }) => {
                  const c = productCache[row.productId!];
                  const qty = Math.max(1, Math.floor(row.quantity));
                  const stock = c?.stock ?? 0;
                  const maxBundles = Math.floor(stock / qty);
                  return (
                    <tr key={row.rowKey}>
                      <td className="px-4 py-3.5 text-center">{thumb(c?.imageUrl)}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900">{c?.name ?? `#${row.productId}`}</div>
                        <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
                          <div>
                            <span className="text-slate-500">Stan magazynowy:</span>{" "}
                            <span className="font-semibold tabular-nums text-slate-800">{stock}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Ilość w zestawie:</span>{" "}
                            <span className="font-semibold tabular-nums text-slate-800">{qty}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Maks. liczba zestawów:</span>{" "}
                            <span className="font-semibold tabular-nums text-slate-900">{maxBundles}</span>
                          </div>
                        </div>
                        {row.importMetaSummary ? (
                          <p className="mt-1 break-all font-mono text-[10px] text-slate-500">Import: {row.importMetaSummary}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-800">{c?.sku || "—"}</td>
                      <td className="px-4 py-3.5 font-mono text-slate-800">{c?.ean || "—"}</td>
                      <td className="px-4 py-3.5 text-right">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          aria-label="Ilość w zestawie"
                          className={`h-8 w-16 rounded-md border border-slate-200 px-2 text-right text-[13px] tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${productLikeNumericInputNoSpinnerClass}`}
                          value={row.quantity}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "");
                            if (digits === "") return;
                            const n = parseInt(digits, 10);
                            onQuantity(index, Number.isFinite(n) && n >= 1 ? n : 1);
                          }}
                          onBlur={(e) => {
                            const digits = e.target.value.replace(/\D/g, "");
                            const n = parseInt(digits, 10);
                            onQuantity(index, Number.isFinite(n) && n >= 1 ? n : 1);
                          }}
                        />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => onRemove(index)}
                          className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                        >
                          Usuń
                        </button>
                      </td>
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
