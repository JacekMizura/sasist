import { useCallback, useEffect, useRef } from "react";
import { ScanLine } from "lucide-react";

import type { DirectSalesProductSearchState } from "../../hooks/directSales/useProductSearch";
import type { DirectSaleSession } from "../../utils/normalizeDirectSales";
import { safeDisplay, safeTrim } from "../../utils/safeStrings";
import type { DirectSaleProductSearchHit } from "../../utils/normalizeDirectSales";
import { sessionStatusPl } from "./directSalesTerminology";
import { ProductSearchDropdown } from "./ProductSearchDropdown";

type SearchState = DirectSalesProductSearchState;

type Props = {
  session: DirectSaleSession | null;
  search: SearchState;
  busy: boolean;
  onAddProduct: (productId: number, sourceLocationId?: number | null, offerId?: number | null) => void;
  onScanCode: (code: string) => void;
};

export function ProductSearchPanel({
  session,
  search,
  busy,
  onAddProduct,
  onScanCode,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [session?.id]);

  const pickHit = useCallback(
    (hit: DirectSaleProductSearchHit) => {
      const productId = Number(hit.product_id);
      if (!Number.isFinite(productId) || productId < 1) return;
      onAddProduct(productId, hit.preferred_location_id ?? null, hit.offer_id);
      search.clear();
      inputRef.current?.focus();
    },
    [onAddProduct, search],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        search.moveActive(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        search.moveActive(-1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const q = safeTrim(search.query);
        if (search.hits.length && search.activeIndex >= 0) {
          pickHit(search.hits[search.activeIndex]);
          return;
        }
        if (q) onScanCode(q);
      }
      if (e.key === "Escape") search.clear();
    },
    [search, pickHit, onScanCode],
  );

  return (
    <aside className="relative z-30 flex w-full shrink-0 flex-col border-r border-blue-50 bg-white p-4 lg:p-6 md:w-72 lg:w-[24rem]">
      
      {/* Opcjonalny mały nagłówek, jeśli TopBar nie jest widoczny w trybie mobilnym.
          Mocno wtopiony w tło, aby nie odwracał uwagi */}
      <div className="mb-6 flex-shrink-0">
        <p className="text-[10px] font-bold text-blue-900/40 uppercase tracking-wider mb-1">
          Wyszukiwanie i skan
        </p>
        <div className="inline-flex items-center gap-2 bg-blue-50/50 px-2.5 py-1 rounded-md border border-blue-50 text-xs font-semibold text-blue-800">
          Sesja {session ? `#${session.id}` : "—"} 
          <span className="text-blue-300">•</span> 
          {sessionStatusPl(session?.status)}
        </div>
      </div>

      {/* Pływająca Wyszukiwarka / Skaner */}
      <div className="relative flex-shrink-0 z-50">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-900/40">
            <ScanLine size={20} />
          </div>
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            disabled={busy || search.disabled}
            value={search.query}
            onChange={(e) => search.setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full pl-11 pr-4 py-4 bg-white border-2 border-blue-100 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-bold shadow-sm disabled:bg-slate-50 disabled:text-slate-400"
            placeholder={search.disabled ? "Wyszukiwanie niedostępne" : "Skan lub wpisz... (Enter dodaje)"}
            aria-label="Wyszukaj produkt po EAN, SKU, nazwie lub numerze katalogowym"
          />
        </div>
        
        {search.loading ? (
          <p className="absolute -bottom-6 left-2 text-[10px] font-semibold text-blue-400 animate-pulse">
            Szukam…
          </p>
        ) : null}

        {/* Dropdown wyników wyświetlany jako warstwa pływająca */}
        {search.open && search.hits.length > 0 ? (
          <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-blue-100 overflow-hidden z-50 flex flex-col max-h-[50vh]">
            <ProductSearchDropdown 
              hits={search.hits} 
              activeIndex={search.activeIndex} 
              onPick={pickHit} 
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}