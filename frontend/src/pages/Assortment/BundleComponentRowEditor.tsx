import { useEffect, useRef, useState } from "react";
import api from "../../api/axios";
import { appFieldLabelClass, appInputClass } from "../../components/app-shell";
import type { BundleComponentRow, CatalogProduct } from "./bundleEditTypes";
import { parseProductsResponse } from "./bundleEditTypes";

type RowEditorProps = {
  row: BundleComponentRow;
  tenantId: number;
  summary?: { name: string; sku: string; ean: string | null; stock: number };
  onPick: (p: CatalogProduct) => void;
  onQuantity: (q: number) => void;
  onSearchText: (t: string) => void;
  onListOpen: (o: boolean) => void;
  onClear: () => void;
  onRemove: () => void;
  mergeProductIntoCache: (p: CatalogProduct) => void;
};

export function BundleComponentRowEditor({
  row,
  tenantId,
  summary,
  onPick,
  onQuantity,
  onSearchText,
  onListOpen,
  onClear,
  onRemove,
  mergeProductIntoCache,
}: RowEditorProps) {
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = row.searchText.trim();
    if (q.length < 2 || row.productId != null) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      setSearchLoading(true);
      const base = { tenant_id: tenantId, limit: 14 };
      Promise.all([
        api.get<unknown>("/products/", { params: { ...base, name: q } }),
        api.get<unknown>("/products/", { params: { ...base, symbol: q } }),
      ])
        .then(([r1, r2]) => {
          const map = new Map<number, CatalogProduct>();
          for (const p of parseProductsResponse(r1.data)) map.set(p.id, p);
          for (const p of parseProductsResponse(r2.data)) map.set(p.id, p);
          setResults(Array.from(map.values()).slice(0, 12));
        })
        .catch(() => setResults([]))
        .finally(() => setSearchLoading(false));
    }, 260);
    return () => window.clearTimeout(t);
  }, [row.searchText, row.productId, tenantId]);

  useEffect(() => {
    if (!row.listOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onListOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [row.listOpen, onListOpen]);

  if (row.productId != null) {
    const name = summary?.name ?? `Produkt #${row.productId}`;
    const sku = summary?.sku || "—";
    const stock = summary != null ? summary.stock : "—";
    return (
      <div className="rounded-lg border border-slate-200/90 bg-slate-50/60 p-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-slate-900">{name}</div>
            <div className="mt-0.5 text-[11px] text-slate-600">
              SKU {sku}
              {summary?.ean ? ` · EAN ${summary.ean}` : null}
              <span className="ml-2 font-semibold text-slate-800">Stan: {stock}</span>
            </div>
            {row.importMetaSummary ? (
              <p className="mt-1 break-all font-mono text-[10px] leading-snug text-slate-500">
                Import: {row.importMetaSummary}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className={appFieldLabelClass}>
              <span className="mr-1">Ilość</span>
              <input
                type="number"
                min={1}
                step={1}
                className="mt-0.5 h-8 w-16 rounded-md border border-slate-200 px-2 text-[13px]"
                value={row.quantity}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  onQuantity(Number.isFinite(n) && n >= 1 ? n : 1);
                }}
              />
            </label>
            <button
              type="button"
              onClick={onClear}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Zmień
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
            >
              Usuń
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative rounded-lg border border-dashed border-slate-300 bg-white p-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <label className={appFieldLabelClass}>Wyszukaj produkt</label>
          <input
            type="search"
            autoComplete="off"
            className={appInputClass}
            placeholder="Nazwa lub SKU…"
            value={row.searchText}
            onChange={(e) => onSearchText(e.target.value)}
            onFocus={() => onListOpen(true)}
          />
          {searchLoading && <p className="mt-1 text-[11px] text-slate-500">Szukanie…</p>}
          {row.listOpen && results.length > 0 ? (
            <ul className="absolute left-2.5 right-2.5 z-10 mt-1 max-h-52 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              {results.map((p) => {
                const sku = p.sku || p.symbol || "—";
                const st = p.stock_quantity ?? 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-2.5 py-2 text-left text-[13px] hover:bg-slate-50"
                      onClick={() => {
                        mergeProductIntoCache(p);
                        onPick(p);
                      }}
                    >
                      <span className="font-medium text-slate-900">{p.name || `ID ${p.id}`}</span>
                      <span className="text-[11px] text-slate-600">
                        SKU {sku} · Stan {st}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
        >
          Usuń wiersz
        </button>
      </div>
    </div>
  );
}
