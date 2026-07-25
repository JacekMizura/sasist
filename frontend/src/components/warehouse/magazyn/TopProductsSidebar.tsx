import { Link } from "react-router-dom";
import { brandLinkTextClass } from "../../../design-system/brandUi";
import type { WarehouseProduct } from "../../../types/warehouse";
import { getProductDetailsPath } from "../../../pages/Products/productPaths";

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

/**
 * Magazyn products rail — light, spacious cards; no thumbnail frames.
 */
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
      className="flex h-full min-h-0 w-[360px] flex-none flex-col self-stretch overflow-hidden bg-[#f7f8fa] shadow-[-4px_0_24px_rgba(15,23,42,0.04)]"
      aria-label="Produkty w magazynie"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 px-5 pb-4 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Katalog</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Produkty</h2>
          <div className="relative mt-4">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z"
              />
            </svg>
            <input
              type="text"
              value={productSearchQuery}
              onChange={(e) => setProductSearchQuery(e.target.value)}
              placeholder="Szukaj nazwy lub SKU…"
              className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm ring-1 ring-slate-200/80 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/40"
            />
          </div>
          {productSearchQuery.trim() &&
            (() => {
              const q = productSearchQuery.trim().toLowerCase();
              const filtered = products.filter(
                (p) =>
                  (p.name ?? "").toLowerCase().includes(q) ||
                  (p.sku ?? "").toLowerCase().includes(q) ||
                  (p.ean ?? "").toLowerCase().includes(q)
              );
              return filtered.length > 0 ? (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70">
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
                      className={`w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-slate-50 ${
                        selectedProductIdOnMap === p.id ? "bg-orange-50 text-orange-800" : "text-slate-800"
                      }`}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">{p.sku}</span>
                    </button>
                  ))}
                  {filtered.length > 15 && (
                    <div className="px-3 py-1.5 text-[11px] text-slate-400">+ {filtered.length - 15} więcej</div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-400">Brak produktów</p>
              );
            })()}
          {selectedProductIdOnMap != null && (
            <button
              type="button"
              onClick={onClearMapProductSelection}
              className={`mt-2 self-start text-xs ${brandLinkTextClass}`}
            >
              Wyczyść wybór
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {topProducts.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Brak produktów</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {topProducts.map(({ product, quantityAssigned, volumeAssignedDm3 }) => {
                const imageUrl = getProductImageUrl(product);
                const selected = selectedProductIdOnMap === product.id;
                return (
                  <li key={product.id}>
                    <Link
                      to={getProductDetailsPath(product.id)}
                      title={`Otwórz produkt: ${product.name}`}
                      onMouseEnter={() => onHoverProductIdChange?.(product.id)}
                      onMouseLeave={() => onHoverProductIdChange?.(null)}
                      className={`block rounded-2xl bg-white p-4 transition-all duration-150 ${
                        selected
                          ? "shadow-md ring-2 ring-orange-400/50"
                          : "shadow-sm ring-1 ring-slate-200/60 hover:shadow-md hover:ring-slate-300/80"
                      }`}
                    >
                      <div className="flex gap-3.5">
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <svg
                              className="h-6 w-6 text-slate-300"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                          {imageUrl && (
                            <img
                              src={imageUrl}
                              alt=""
                              className="absolute inset-0 z-10 h-full w-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-slate-900">
                            {product.name}
                          </div>
                          <div className="mt-1 truncate text-[11px] tracking-wide text-slate-400">
                            {product.sku ?? "—"}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold tabular-nums text-slate-900">
                              {quantityAssigned}
                              <span className="ml-1 text-[12px] font-medium text-slate-400">szt.</span>
                            </span>
                            <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-sky-700">
                              {formatVolume(volumeAssignedDm3)} dm³
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {topProducts.length > 0 && (
            <p className="mt-5 text-center text-[11px] text-slate-400">Brak więcej produktów</p>
          )}
        </div>
      </div>
    </aside>
  );
}
