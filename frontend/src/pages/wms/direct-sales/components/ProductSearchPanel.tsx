import { useCallback, useRef } from "react";

import { safeDisplay, safeTrim } from "../../../../utils/safeStrings";
import type { DirectSaleSession } from "../services/directSalesApi";
import type { DirectSaleProductSearchHit } from "../../../../utils/normalizeDirectSales";
import type { useProductSearch } from "../hooks/useProductSearch";

type SearchState = ReturnType<typeof useProductSearch>;

type Props = {
  session: DirectSaleSession | null;
  search: SearchState;
  busy: boolean;
  error: string | null;
  onAddProduct: (productId: number, sourceLocationId?: number | null, offerId?: number | null) => void;
  onScanCode: (code: string) => void;
};

function HitRow({
  hit,
  active,
  onPick,
}: {
  hit: DirectSaleProductSearchHit;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-sky-50 ${
        active ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : ""
      }`}
    >
      {hit.image_url ? (
        <img src={hit.image_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
          brak
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-slate-900">{hit.name}</div>
        <div className="truncate text-xs text-slate-500">
          {safeDisplay(hit.sku, "—")} · EAN {safeDisplay(hit.ean, "—")}
        </div>
        <div className="text-xs text-slate-600">
          dostępne: {hit.available_qty}
          {hit.preferred_location_code ? ` · ${hit.preferred_location_code}` : ""}
          {hit.unit_price != null ? ` · ${hit.unit_price.toFixed(2)} zł` : ""}
        </div>
      </div>
      <span className="shrink-0 text-xs font-semibold text-sky-700">+</span>
    </button>
  );
}

export function ProductSearchPanel({ session, search, busy, error, onAddProduct, onScanCode }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const pickHit = useCallback(
    (hit: DirectSaleProductSearchHit) => {
      onAddProduct(hit.product_id, hit.preferred_location_id, hit.offer_id);
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
    <aside className="flex w-full shrink-0 flex-col md:w-72">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h1 className="text-base font-semibold text-slate-900">Terminal sprzedaży</h1>
        <p className="mt-0.5 text-xs text-slate-500">EAN → Enter · wyszukiwanie poniżej</p>
        <div className="mt-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs text-slate-600">
          Sesja {session ? `#${session.id}` : "—"} · {safeDisplay(session?.status, "—")}
        </div>
        <label className="mt-3 block text-xs font-medium text-slate-700">
          EAN / SKU / nazwa
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            disabled={busy || search.disabled}
            value={search.query}
            onChange={(e) => search.setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 disabled:bg-slate-50 disabled:text-slate-400"
            placeholder={search.disabled ? "Wyszukiwanie niedostępne" : "Skan lub wpisz…"}
          />
        </label>
        {search.disabled ? (
          <p className="mt-1 text-[10px] text-slate-500">Wyszukiwanie produktów tymczasowo wyłączone.</p>
        ) : null}
        {search.loading ? <p className="mt-1 text-[10px] text-slate-400">Szukam…</p> : null}
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>
      {search.open ? (
        <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {search.hits.length ? (
            search.hits.map((hit, i) => (
              <HitRow
                key={hit.product_id}
                hit={hit}
                active={i === search.activeIndex}
                onPick={() => pickHit(hit)}
              />
            ))
          ) : (
            <p className="p-3 text-sm text-slate-500">Brak wyników — Enter dodaje po kodzie.</p>
          )}
        </div>
      ) : null}
    </aside>
  );
}
