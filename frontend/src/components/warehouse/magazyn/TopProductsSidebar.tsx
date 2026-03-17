import { Link } from "react-router-dom";
import type { WarehouseProduct } from "../../../types/warehouse";

export interface TopProductItem {
  product: WarehouseProduct;
  totalQuantity: number;
  totalVolumeDm3: number;
}

export interface TopProductsSidebarProps {
  topProducts: TopProductItem[];
  getProductImageUrl: (p: WarehouseProduct) => string | null;
  formatVolume: (n: number) => string;
}

export function TopProductsSidebar({
  topProducts,
  getProductImageUrl,
  formatVolume,
}: TopProductsSidebarProps) {
  return (
    <aside
      className="w-[320px] shrink-0 flex flex-col h-full bg-slate-800 border-l border-slate-700 rounded-r-xl overflow-hidden"
      aria-label="Produkty w magazynie"
    >
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-600 shrink-0">
          <h2 className="text-xs font-black uppercase text-slate-300">PRODUKTY W MAGAZYNIE</h2>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-3 flex flex-col gap-3">
        {topProducts.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">Brak produktów</p>
        ) : (
          topProducts.map(({ product, totalQuantity, totalVolumeDm3 }) => {
            const imageUrl = getProductImageUrl(product);
            return (
              <Link
                key={product.id}
                to={`/products/${product.id}`}
                title={`Otwórz produkt: ${product.name}`}
                className="block rounded-xl border border-slate-600 bg-slate-700/80 p-3 shadow transition hover:bg-slate-600/100 hover:shadow-sm cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-slate-600 border border-slate-500">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover z-10"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-100 break-words line-clamp-2">{product.name}</div>
                    <div className="text-xs text-slate-400 mt-1 truncate">SKU: {product.sku ?? "—"} · EAN: {product.ean ?? "—"}</div>
                    <div className="text-xs text-slate-300 mt-1">Łączna liczba sztuk: <span className="font-mono font-semibold text-slate-100">{totalQuantity}</span></div>
                    <div className="text-xs text-slate-300 mt-0.5">Objętość w magazynie: <span className="font-mono font-semibold text-cyan-300">{formatVolume(totalVolumeDm3)} dm³</span></div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
        </div>
      </div>
    </aside>
  );
}
