import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../api/axios";
import {
  createBundle,
  getBundle,
  updateBundle,
  type BundleItemWrite,
  type BundleRead,
} from "../../api/bundlesApi";

type TabId = "basic" | "products";

type ProductSummary = {
  name: string;
  sku: string;
  ean: string | null;
  stock: number;
};

type CatalogProduct = {
  id: number;
  name?: string | null;
  ean?: string | null;
  symbol?: string | null;
  sku?: string | null;
  stock_quantity?: number;
};

export type BundleComponentRow = {
  rowKey: string;
  productId: number | null;
  quantity: number;
  searchText: string;
  listOpen: boolean;
  /** Skrót pól z importu CSV (metadata_json pozycji zestawu). */
  importMetaSummary?: string | null;
};

function parseProductsResponse(data: unknown): CatalogProduct[] {
  if (Array.isArray(data)) return data as CatalogProduct[];
  if (data && typeof data === "object" && "items" in data && Array.isArray((data as { items: unknown }).items)) {
    return (data as { items: CatalogProduct[] }).items;
  }
  return [];
}

function newRowKey(): string {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyRow(): BundleComponentRow {
  return { rowKey: newRowKey(), productId: null, quantity: 1, searchText: "", listOpen: false, importMetaSummary: null };
}

function formatBundleItemImportMeta(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== "object") return null;
    const bits = Object.entries(o).map(([k, v]) => `${k}: ${String(v)}`);
    return bits.length ? bits.join(" · ") : null;
  } catch {
    return raw.trim().slice(0, 160);
  }
}

/** Merge duplicate product_ids by sum qty; preserve first-seen order for sort_order. */
export function normalizeComponentsForSave(rows: BundleComponentRow[]): BundleItemWrite[] {
  const firstIndex = new Map<number, number>();
  const qtyByPid = new Map<number, number>();
  rows.forEach((r, idx) => {
    if (r.productId == null || r.quantity < 1) return;
    const pid = r.productId;
    if (!firstIndex.has(pid)) firstIndex.set(pid, idx);
    qtyByPid.set(pid, (qtyByPid.get(pid) ?? 0) + Math.floor(r.quantity));
  });
  return Array.from(qtyByPid.entries())
    .sort((a, b) => (firstIndex.get(a[0]) ?? 0) - (firstIndex.get(b[0]) ?? 0))
    .map(([product_id, quantity], sort_order) => ({ product_id, quantity, sort_order }));
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function formatMoneyZl(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(2)} zł`;
}

type BundleEditModalProps = {
  open: boolean;
  tenantId: number;
  bundleId: number | null;
  onClose: () => void;
  onSaved: () => void;
};

export function BundleEditModal({ open, tenantId, bundleId, onClose, onSaved }: BundleEditModalProps) {
  const isNew = bundleId == null;
  const [activeTab, setActiveTab] = useState<TabId>("basic");
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [ean, setEan] = useState("");
  const [active, setActive] = useState(true);
  const [salePrice, setSalePrice] = useState<number | "">("");
  const [imageUrl, setImageUrl] = useState("");

  const [rows, setRows] = useState<BundleComponentRow[]>(() => [emptyRow()]);
  const [productCache, setProductCache] = useState<Record<number, ProductSummary>>({});

  const tabClass = (id: TabId) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      activeTab === id ? "bg-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
    }`;

  const fieldLabel = "block text-sm font-medium text-slate-700 mb-1";
  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-violet-500 focus:border-violet-400";

  const mergeProductIntoCache = useCallback((p: CatalogProduct) => {
    const stock = p.stock_quantity != null && Number.isFinite(Number(p.stock_quantity)) ? Number(p.stock_quantity) : 0;
    setProductCache((prev) => ({
      ...prev,
      [p.id]: {
        name: (p.name ?? `Produkt #${p.id}`).trim() || `Produkt #${p.id}`,
        sku: (p.sku || p.symbol || "").trim(),
        ean: p.ean != null ? String(p.ean) : null,
        stock,
      },
    }));
  }, []);

  const prefetchProductDetails = useCallback(
    async (ids: number[]) => {
      const unique = [...new Set(ids)].filter((id) => id > 0);
      await Promise.all(
        unique.map(async (id) => {
          try {
            const { data } = await api.get<Record<string, unknown>>(`/products/${id}/`, {
              params: { tenant_id: tenantId },
            });
            const cp: CatalogProduct = {
              id,
              name: data.name as string | null,
              ean: data.ean as string | null,
              symbol: data.symbol as string | null,
              sku: data.sku as string | null,
              stock_quantity: data.stock_quantity != null ? Number(data.stock_quantity) : 0,
            };
            mergeProductIntoCache(cp);
          } catch {
            /* keep placeholder from bundle items */
          }
        }),
      );
    },
    [tenantId, mergeProductIntoCache],
  );

  const resetForm = useCallback(() => {
    setActiveTab("basic");
    setLoadErr(null);
    setSaveErr(null);
    setName("");
    setSku("");
    setEan("");
    setActive(true);
    setSalePrice("");
    setImageUrl("");
    setRows([emptyRow()]);
    setProductCache({});
  }, []);

  useEffect(() => {
    if (!open) return;

    if (isNew) {
      resetForm();
      return;
    }

    let cancelled = false;
    setLoadErr(null);
    void (async () => {
      try {
        const b: BundleRead = await getBundle(tenantId, bundleId);
        if (cancelled) return;
        setName(b.name);
        setSku(b.sku ?? "");
        setEan(b.ean ?? "");
        setActive(b.active);
        setSalePrice(b.sale_price != null && Number.isFinite(Number(b.sale_price)) ? Number(b.sale_price) : "");
        setImageUrl((b.image_url ?? "").trim());

        const seed: Record<number, ProductSummary> = {};
        for (const it of b.items) {
          seed[it.product_id] = {
            name: (it.product_name ?? `Produkt #${it.product_id}`).trim(),
            sku: (it.product_sku ?? "").trim(),
            ean: null,
            stock: 0,
          };
        }
        setProductCache(seed);

        setRows(
          b.items.length > 0
            ? b.items.map((it, i) => ({
                rowKey: `loaded-${it.id}-${i}`,
                productId: it.product_id,
                quantity: it.quantity,
                searchText: "",
                listOpen: false,
                importMetaSummary: formatBundleItemImportMeta(it.metadata_json),
              }))
            : [emptyRow()],
        );
        void prefetchProductDetails(b.items.map((it) => it.product_id));
      } catch {
        if (!cancelled) setLoadErr("Nie udało się wczytać zestawu.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, isNew, bundleId, tenantId, resetForm, prefetchProductDetails]);

  const bundleAvailability = useMemo(() => {
    const parts: number[] = [];
    for (const r of rows) {
      if (r.productId == null || r.quantity < 1) continue;
      const c = productCache[r.productId];
      if (!c) return null;
      const req = Math.floor(r.quantity);
      if (req <= 0) continue;
      parts.push(Math.floor(c.stock / req));
    }
    if (parts.length === 0) return null;
    return Math.min(...parts);
  }, [rows, productCache]);

  const pickProduct = useCallback(
    (rowIndex: number, p: CatalogProduct) => {
      mergeProductIntoCache(p);
      setRows((prev) => {
        const dup = prev.findIndex((r, j) => j !== rowIndex && r.productId === p.id);
        if (dup >= 0) {
          const next = [...prev];
          next[dup] = { ...next[dup], quantity: next[dup].quantity + next[rowIndex].quantity };
          return next.filter((_, j) => j !== rowIndex);
        }
        const next = [...prev];
        next[rowIndex] = {
          ...next[rowIndex],
          productId: p.id,
          searchText: "",
          listOpen: false,
          quantity: Math.max(1, Math.floor(next[rowIndex].quantity)),
          importMetaSummary: null,
        };
        return next;
      });
    },
    [mergeProductIntoCache],
  );

  const updateRow = useCallback((rowIndex: number, patch: Partial<BundleComponentRow>) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], ...patch };
      return next;
    });
  }, []);

  const removeRow = useCallback((rowIndex: number) => {
    setRows((prev) => (prev.length <= 1 ? [emptyRow()] : prev.filter((_, j) => j !== rowIndex)));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
  }, []);

  const clearProduct = useCallback((rowIndex: number) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIndex] = {
        ...next[rowIndex],
        productId: null,
        searchText: "",
        listOpen: false,
        importMetaSummary: null,
      };
      return next;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveErr(null);
    const items = normalizeComponentsForSave(rows);
    if (items.length === 0) {
      setSaveErr("Dodaj co najmniej jeden produkt w zakładce „Produkty”.");
      setActiveTab("products");
      return;
    }
    const sp = salePrice === "" ? null : typeof salePrice === "number" ? salePrice : Number(salePrice);
    setSaving(true);
    try {
      if (isNew) {
        await createBundle({
          tenant_id: tenantId,
          name: name.trim(),
          sku: sku.trim() || null,
          ean: ean.trim() || null,
          sale_price: sp != null && Number.isFinite(sp) ? sp : null,
          active,
          image_url: imageUrl.trim() || null,
          items,
        });
      } else {
        await updateBundle(tenantId, bundleId!, {
          name: name.trim(),
          sku: sku.trim() || null,
          ean: ean.trim() || null,
          sale_price: sp != null && Number.isFinite(sp) ? sp : null,
          active,
          image_url: imageUrl.trim() || null,
          items,
        });
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? String((err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "")
          : "";
      setSaveErr(msg || "Zapis nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex h-[88vh] max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {isNew ? "Nowy zestaw" : "Edycja zestawu"}
              </p>
              <h2 className="mt-1 truncate text-xl font-bold text-slate-900">{name.trim() || (isNew ? "Bez nazwy" : "—")}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {!isNew && bundleId != null ? (
                  <span className="inline-flex items-center rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                    ID: {bundleId}
                  </span>
                ) : null}
                <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-900 ring-1 ring-violet-200">
                  Wirtualny zestaw (bez magazynu)
                </span>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-900 ring-1 ring-blue-200">
                  Cena: {formatMoneyZl(salePrice === "" ? null : typeof salePrice === "number" ? salePrice : Number(salePrice))}
                </span>
                {bundleAvailability != null ? (
                  <span
                    className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200"
                    title="min(stan magazynowy ÷ ilość w zestawie) po składowych"
                  >
                    Dostępność zestawów: ~{bundleAvailability}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    Dostępność: —
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {loadErr ? (
          <div className="shrink-0 border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-800">{loadErr}</div>
        ) : null}

        <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-slate-100 bg-white px-6 py-3">
              <div className="flex flex-wrap gap-1">
                <button type="button" className={tabClass("basic")} onClick={() => setActiveTab("basic")}>
                  Podstawowe
                </button>
                <button type="button" className={tabClass("products")} onClick={() => setActiveTab("products")}>
                  Produkty
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
              {activeTab === "basic" && (
                <div className="space-y-6 lg:grid lg:grid-cols-[1fr_280px] lg:items-start lg:gap-6">
                  <div className="space-y-6">
                    <Card title="Identyfikacja i cena">
                      <div>
                        <label className={fieldLabel}>Nazwa *</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className={fieldLabel}>SKU</label>
                          <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={fieldLabel}>EAN</label>
                          <input type="text" value={ean} onChange={(e) => setEan(e.target.value)} className={inputClass} />
                        </div>
                      </div>
                      <div>
                        <label className={fieldLabel}>Cena sprzedaży (cały zestaw)</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={salePrice === "" ? "" : salePrice}
                          onChange={(e) => {
                            const s = e.target.value.trim().replace(",", ".");
                            if (s === "") setSalePrice("");
                            else {
                              const n = parseFloat(s);
                              if (Number.isFinite(n)) setSalePrice(n);
                            }
                          }}
                          className={inputClass}
                          placeholder="Opcjonalnie"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          Przy zamówieniu suma cen linii jest dopasowywana do tej wartości (proporcjonalnie do cen składowych).
                        </p>
                      </div>
                      <div>
                        <label className={fieldLabel}>URL zdjęcia</label>
                        <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inputClass} placeholder="https://…" />
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" className="rounded border-slate-300 text-violet-600" checked={active} onChange={(e) => setActive(e.target.checked)} />
                        Aktywny (widoczny przy tworzeniu zamówień)
                      </label>
                    </Card>
                  </div>
                  <aside className="min-h-0 space-y-4 lg:sticky lg:top-0">
                    {imageUrl.trim() ? (
                      <Card title="Zdjęcie">
                        <img src={imageUrl.trim()} alt="" className="mx-auto max-h-40 rounded-lg object-contain" />
                      </Card>
                    ) : null}
                  </aside>
                </div>
              )}

              {activeTab === "products" && (
                <div className="space-y-4">
                  <Card title="Skład zestawu">
                    <p className="text-xs text-slate-600">
                      Wyszukaj produkt po nazwie lub SKU. Ten sam produkt na dwóch wierszach zostanie scalony przy zapisie;
                      wybór istniejącego produktu z listy scala ilości od razu.
                    </p>
                    <div className="space-y-3">
                      {rows.map((row, i) => (
                        <BundleComponentRowEditor
                          key={row.rowKey}
                          row={row}
                          tenantId={tenantId}
                          summary={row.productId != null ? productCache[row.productId] : undefined}
                          onPick={(p) => pickProduct(i, p)}
                          onQuantity={(q) => updateRow(i, { quantity: q })}
                          onSearchText={(t) => updateRow(i, { searchText: t })}
                          onListOpen={(o) => updateRow(i, { listOpen: o })}
                          onClear={() => clearProduct(i)}
                          onRemove={() => removeRow(i)}
                          mergeProductIntoCache={mergeProductIntoCache}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addRow}
                      className="mt-2 rounded-lg border border-dashed border-violet-300 bg-violet-50/50 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100"
                    >
                      + Dodaj produkt
                    </button>
                  </Card>
                </div>
              )}

              {saveErr ? <p className="mt-4 text-sm text-red-600">{saveErr}</p> : null}
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={saving || !!loadErr}
              className="rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {saving ? "Zapisywanie…" : isNew ? "Utwórz zestaw" : "Zapisz"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type RowEditorProps = {
  row: BundleComponentRow;
  tenantId: number;
  summary?: ProductSummary;
  onPick: (p: CatalogProduct) => void;
  onQuantity: (q: number) => void;
  onSearchText: (t: string) => void;
  onListOpen: (o: boolean) => void;
  onClear: () => void;
  onRemove: () => void;
  mergeProductIntoCache: (p: CatalogProduct) => void;
};

function BundleComponentRowEditor({
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

  const fieldLabelRow = "text-xs font-medium text-slate-600";

  if (row.productId != null) {
    const name = summary?.name ?? `Produkt #${row.productId}`;
    const sku = summary?.sku || "—";
    const stock = summary != null ? summary.stock : "—";
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-slate-900">{name}</div>
            <div className="mt-0.5 text-xs text-slate-600">
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
            <label className={fieldLabelRow}>
              <span className="mr-1">Ilość w zestawie</span>
              <input
                type="number"
                min={1}
                step={1}
                className="mt-0.5 w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
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
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Zmień produkt
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              Usuń
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative rounded-xl border border-dashed border-slate-300 bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <label className={fieldLabelRow}>Wyszukaj produkt</label>
          <input
            type="search"
            autoComplete="off"
            className="mt-0.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Nazwa lub SKU…"
            value={row.searchText}
            onChange={(e) => onSearchText(e.target.value)}
            onFocus={() => onListOpen(true)}
          />
          {searchLoading && <p className="mt-1 text-xs text-slate-500">Szukanie…</p>}
          {row.listOpen && results.length > 0 ? (
            <ul className="absolute left-3 right-3 z-10 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {results.map((p) => {
                const sku = p.sku || p.symbol || "—";
                const st = p.stock_quantity ?? 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-violet-50"
                      onClick={() => {
                        mergeProductIntoCache(p);
                        onPick(p);
                      }}
                    >
                      <span className="font-medium text-slate-900">{p.name || `ID ${p.id}`}</span>
                      <span className="text-xs text-slate-600">
                        SKU {sku} · Stan {st}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            Usuń wiersz
          </button>
        </div>
      </div>
    </div>
  );
}
