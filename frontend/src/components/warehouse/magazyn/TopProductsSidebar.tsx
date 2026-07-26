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
  const searchQ = productSearchQuery.trim().toLowerCase();
  const searchMatches =
    searchQ.length > 0
      ? products.filter(
          (p) =>
            (p.name ?? "").toLowerCase().includes(searchQ) ||
            (p.sku ?? "").toLowerCase().includes(searchQ) ||
            (p.ean ?? "").toLowerCase().includes(searchQ)
        )
      : [];

  return (
    <aside
      className="flex h-full min-h-0 w-[min(42vw,44rem)] min-w-[22rem] max-w-[52rem] flex-none flex-col self-stretch overflow-hidden bg-[#f7f8fa] shadow-[-4px_0_24px_rgba(15,23,42,0.04)]"
      aria-label="Produkty w magazynie"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 px-5 pb-3 pt-5">
          <div className="relative">
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
          {searchQ.length > 0 ? (
            <p className="mt-2 text-[11px] text-slate-500">
              {searchMatches.length === 1
                ? "1 produkt"
                : searchMatches.length >= 2 && searchMatches.length <= 4
                  ? `${searchMatches.length} produkty`
                  : `${searchMatches.length} produktów`}
            </p>
          ) : null}
          {searchQ.length > 0 &&
            (searchMatches.length > 0 ? (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70">
                {searchMatches.slice(0, 15).map((p) => (
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
                {searchMatches.length > 15 && (
                  <div className="px-3 py-1.5 text-[11px] text-slate-400">+ {searchMatches.length - 15} więcej</div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Brak produktów</p>
            ))}
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
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
                      className={`block h-full rounded-2xl bg-white p-4 transition-all duration-150 ${
                        selected
                          ? "shadow-md ring-2 ring-orange-400/50"
                          : "shadow-sm ring-1 ring-slate-200/60 hover:shadow-md hover:ring-slate-300/80"
                      }`}
                    >
                      <div className="flex gap-3.5">
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden bg-white">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt=""
                              className="absolute inset-0 h-full w-full object-contain"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-slate-900">
                            {product.name}
                          </div>
                          <div className="mt-1 truncate text-[11px] tracking-wide text-slate-400">
                            {product.sku ?? "—"}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] tracking-wide text-slate-400">
                            EAN: {product.ean?.trim() ? product.ean : "—"}
                          </div>
                          <div className="mt-3 text-[13px] tabular-nums text-slate-700">
                            <span className="font-semibold text-slate-900">{quantityAssigned}</span>
                            <span className="text-slate-400"> szt.</span>
                            <span className="mx-1.5 text-slate-300">•</span>
                            <span className="font-semibold text-sky-700">{formatVolume(volumeAssignedDm3)}</span>
                            <span className="text-sky-600/80"> dm³</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
