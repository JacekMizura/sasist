import { useEffect, useRef, useState } from "react";

import api from "../../api/axios";
import { productLikeInputClass } from "../../components/catalog";
import type { CatalogProduct } from "./bundleEditTypes";
import { parseProductsResponse } from "./bundleEditTypes";

type Props = {
  tenantId: number;
  onPick: (p: CatalogProduct) => void;
  mergeProductIntoCache: (p: CatalogProduct) => void;
};

function productThumb(url: string | null | undefined) {
  const u = (url ?? "").trim();
  if (!u) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center text-[10px] text-slate-400">—</div>
    );
  }
  return <img src={u} alt="" className="h-10 w-10 shrink-0 object-contain" />;
}

export function BundleProductSearch({ tenantId, onPick, mergeProductIntoCache }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      setLoading(true);
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
        .finally(() => setLoading(false));
    }, 260);
    return () => window.clearTimeout(t);
  }, [query, tenantId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1 block text-sm font-medium text-slate-700">Dodaj produkt do zestawu</label>
      <input
        type="search"
        autoComplete="off"
        className={productLikeInputClass}
        placeholder="Nazwa, SKU lub EAN…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {loading ? <p className="mt-1 text-[11px] text-slate-500">Szukanie…</p> : null}
      {open && results.length > 0 ? (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-80 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {results.map((p) => {
            const sku = p.sku || p.symbol || "—";
            const ean = p.ean?.trim() || "—";
            const st = p.stock_quantity ?? 0;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                  onClick={() => {
                    mergeProductIntoCache(p);
                    onPick(p);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {productThumb(p.image_url)}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-slate-900">{p.name || `ID ${p.id}`}</div>
                    <div className="mt-0.5 text-[11px] text-slate-600">SKU: {sku}</div>
                    <div className="text-[11px] text-slate-600">EAN: {ean}</div>
                    <div className="text-[11px] font-medium text-slate-800">Stan: {st}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
