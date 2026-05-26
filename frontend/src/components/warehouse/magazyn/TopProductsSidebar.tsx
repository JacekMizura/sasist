import { Link } from "react-router-dom";
import type { WarehouseProduct } from "../../../types/warehouse";

export interface TopProductItem {
  product: WarehouseProduct;
  quantityAssigned: number;
  volumeAssignedDm3: number;
}

export interface TopProductsSidebarProps {
  topProducts: TopProductItem[];
  getProductImageUrl: (p: WarehouseProduct) => string | null;
  formatVolume: (n: number) => string;
  onHoverProductIdChange?: (productId: string | null) => void;
  /** Global catalog search (same state as rack sidebar); drives map product locator. */
  products: WarehouseProduct[];
  productSearchQuery: string;
  setProductSearchQuery: (v: string) => void;
  selectedProductIdOnMap: string | null;
  setSelectedProductIdOnMap: (id: string | null) => void;
  setHoveredProductIdOnMap: (id: string | null) => void;
  onClearMapProductSelection: () => void;
}

export function TopProductsSidebar({
  topProducts,
  getProductImageUrl,
  formatVolume,
  onHoverProductIdChange,
  products,
  productSearchQuery,
  setProductSearchQuery,
  selectedProductIdOnMap,
  setSelectedProductIdOnMap,
  setHoveredProductIdOnMap,
  onClearMapProductSelection,
}: TopProductsSidebarProps) {
  return (
    <aside
      className="flex h-full min-h-0 w-[380px] flex-none flex-col self-stretch overflow-hidden rounded-r-xl border-l border-slate-700 bg-slate-800"
      aria-label="Produkty w magazynie"
    >
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-slate-600 flex flex-col gap-2.5 px-4 py-3.5">
          <h2 className="text-xs font-black uppercase text-slate-300">PRODUKTY W MAGAZYNIE</h2>
          <input
            type="text"
            value={productSearchQuery}
            onChange={(e) => setProductSearchQuery(e.target.value)}
            placeholder="Szukaj (nazwa, SKU...)"
            className="w-full rounded-lg border border-slate-600 bg-slate-700/50 text-slate-100 placeholder-slate-500 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
          />
          {productSearchQuery.trim() && (() => {
            const q = productSearchQuery.trim().toLowerCase();
            const filtered = products.filter(
              (p) =>
                (p.name ?? "").toLowerCase().includes(q) ||
                (p.sku ?? "").toLowerCase().includes(q) ||
                (p.ean ?? "").toLowerCase().includes(q)
            );
            return filtered.length > 0 ? (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/50 shadow-sm">
                {filtered.slice(0, 15).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseEnter={() => setHoveredProductIdOnMap(p.id)}
                    onMouseLeave={() => setHoveredProductIdOnMap(null)}
                    onClick={() => {
                      setHoveredProductIdOnMap(null);
                      setSelectedProductIdOnMap(p.id);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700/80 border-b border-slate-600 last:border-b-0 ${
                      selectedProductIdOnMap === p.id ? "bg-cyan-900/40 text-cyan-200" : "text-slate-200"
                    }`}
                  >
                    {p.name} <span className="text-slate-400 text-xs">({p.sku})</span>
                  </button>
                ))}
                {filtered.length > 15 && <div className="px-3 py-1 text-xs text-slate-400">+ {filtered.length - 15} więcej</div>}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Brak produktów</p>
            );
          })()}
          {selectedProductIdOnMap != null && (
            <button
              type="button"
              onClick={onClearMapProductSelection}
              className="self-start text-xs text-slate-400 hover:text-slate-200 underline"
            >
              Wyczyść wybór produktu
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-2 flex flex-col gap-3">
        {topProducts.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">Brak produktów</p>
        ) : (
          topProducts.map(({ product, quantityAssigned, volumeAssignedDm3 }) => {
            const imageUrl = getProductImageUrl(product);
            return (
              <Link
                key={product.id}
                to={`/products/${product.id}`}
                title={`Otwórz produkt: ${product.name}`}
                onMouseEnter={() => onHoverProductIdChange?.(product.id)}
                onMouseLeave={() => onHoverProductIdChange?.(null)}
                className={`block cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all duration-150 ${
                  selectedProductIdOnMap === product.id
                    ? "border-cyan-400/50 bg-slate-600/90 ring-2 ring-cyan-400/35 shadow-md"
                    : "border-slate-600 bg-slate-700/80 hover:border-slate-500 hover:bg-slate-600/90 hover:shadow-md"
                }`}
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
                    <div className="text-xs text-slate-300 mt-1">
                      W lokalizacjach: <span className="font-mono font-semibold text-slate-100">{quantityAssigned}</span> szt.
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Objętość: <span className="font-mono font-semibold text-cyan-300">{formatVolume(volumeAssignedDm3)} dm³</span>
                    </div>
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
