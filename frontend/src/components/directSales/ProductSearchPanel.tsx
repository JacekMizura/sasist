import { useCallback, useEffect, useRef } from "react";

import type { DirectSalesSettingsConfig } from "../../modules/wmsSettings/directSales/schemas/directSalesSettingsSchema";
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
  settings: DirectSalesSettingsConfig;
  busy: boolean;
  onAddProduct: (productId: number, sourceLocationId?: number | null) => void;
  onScanCode: (code: string) => void;
  onSuspend: () => void;
  onNewSession: () => void;
};

export function ProductSearchPanel({
  session,
  search,
  settings,
  busy,
  onAddProduct,
  onScanCode,
  onSuspend,
  onNewSession,
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
      onAddProduct(productId, hit.preferred_location_id ?? null);
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
    <aside className="flex w-full shrink-0 flex-col md:w-64 lg:w-72">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h1 className="text-base font-semibold text-slate-900">Terminal sprzedaży</h1>
        <p className="mt-0.5 text-xs text-slate-500">Skan · wyszukiwanie · Enter dodaje</p>
        <div className="mt-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs text-slate-600">
          Sesja {session ? `#${session.id}` : "—"} · {sessionStatusPl(session?.status)}
        </div>
        <label className="mt-3 block text-xs font-medium text-slate-700">
          EAN / SKU / nazwa / nr katalogowy
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
        {search.loading ? <p className="mt-1 text-[10px] text-slate-400">Szukam…</p> : null}
        <div className="mt-3 flex gap-1">
          <button
            type="button"
            disabled={busy || !session}
            onClick={onSuspend}
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-[10px] text-slate-700 disabled:opacity-50"
          >
            Zawieś
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onNewSession}
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-[10px] text-slate-700 disabled:opacity-50"
          >
            Nowa sesja
          </button>
        </div>
      </div>
      {search.open ? (
        <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <ProductSearchDropdown
            hits={search.hits}
            activeIndex={search.activeIndex}
            settings={settings}
            onPick={pickHit}
          />
        </div>
      ) : null}
    </aside>
  );
}
