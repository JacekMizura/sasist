import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, History, Link2, Package, ScrollText } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  createBundle,
  getBundle,
  updateBundle,
  type BundleRead,
} from "../../api/bundlesApi";
import api from "../../api/axios";
import { AppEmptyState, AppSection, appFieldLabelClass, appInputClass, appTabActiveClass, appTabInactiveClass } from "../../components/app-shell";
import { BundleComponentRowEditor } from "./BundleComponentRowEditor";
import {
  BUNDLE_EDIT_TABS,
  emptyRow,
  formatBundleItemImportMeta,
  formatMoneyZl,
  normalizeComponentsForSave,
  type BundleComponentRow,
  type BundleEditTabId,
  type CatalogProduct,
  type ProductSummary,
} from "./bundleEditTypes";

export { normalizeComponentsForSave } from "./bundleEditTypes";
export type { BundleComponentRow } from "./bundleEditTypes";

type BundleEditModalProps = {
  variant?: "modal" | "page";
  open?: boolean;
  tenantId: number;
  bundleId: number | null;
  initialTab?: BundleEditTabId;
  onClose: () => void;
  onSaved: () => void;
  onCreated?: (bundle: BundleRead) => void;
};

export function BundleEditModal({
  variant = "modal",
  open = true,
  tenantId,
  bundleId,
  initialTab,
  onClose,
  onSaved,
  onCreated,
}: BundleEditModalProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isPage = variant === "page";
  const isNew = bundleId == null;

  const tabFromUrl = searchParams.get("tab") as BundleEditTabId | null;
  const validTab = BUNDLE_EDIT_TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl! : null;
  const [activeTab, setActiveTab] = useState<BundleEditTabId>(initialTab ?? validTab ?? "basic");

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

  const setTab = useCallback(
    (tab: BundleEditTabId) => {
      setActiveTab(tab);
      if (isPage) {
        setSearchParams((prev) => {
          const n = new URLSearchParams(prev);
          n.set("tab", tab);
          return n;
        }, { replace: true });
      }
    },
    [isPage, setSearchParams],
  );

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
            mergeProductIntoCache({
              id,
              name: data.name as string | null,
              ean: data.ean as string | null,
              symbol: data.symbol as string | null,
              sku: data.sku as string | null,
              stock_quantity: data.stock_quantity != null ? Number(data.stock_quantity) : 0,
            });
          } catch {
            /* keep placeholder */
          }
        }),
      );
    },
    [tenantId, mergeProductIntoCache],
  );

  const resetForm = useCallback(() => {
    setActiveTab(initialTab ?? "basic");
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
  }, [initialTab]);

  useEffect(() => {
    if (!isPage && !open) return;

    if (isNew) {
      resetForm();
      return;
    }

    let cancelled = false;
    setLoadErr(null);
    void (async () => {
      try {
        const b = await getBundle(tenantId, bundleId!);
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
            stock: it.product_stock ?? 0,
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
  }, [open, isPage, isNew, bundleId, tenantId, resetForm, prefetchProductDetails]);

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

  const addRow = useCallback(() => setRows((prev) => [...prev, emptyRow()]), []);

  const clearProduct = useCallback((rowIndex: number) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], productId: null, searchText: "", listOpen: false, importMetaSummary: null };
      return next;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveErr(null);
    const items = normalizeComponentsForSave(rows);
    if (items.length === 0) {
      setSaveErr("Dodaj co najmniej jeden produkt w zakładce „Produkty”.");
      setTab("products");
      return;
    }
    const sp = salePrice === "" ? null : typeof salePrice === "number" ? salePrice : Number(salePrice);
    setSaving(true);
    try {
      if (isNew) {
        const created = await createBundle({
          tenant_id: tenantId,
          name: name.trim(),
          sku: sku.trim() || null,
          ean: ean.trim() || null,
          sale_price: sp != null && Number.isFinite(sp) ? sp : null,
          active,
          image_url: imageUrl.trim() || null,
          items,
        });
        onSaved();
        onCreated?.(created);
        if (isPage) {
          navigate(`/bundles/${created.id}/edit`, { replace: true });
        } else {
          onClose();
        }
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
        onSaved();
        if (!isPage) onClose();
      }
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

  if (!isPage && !open) return null;

  const salePriceNum = salePrice === "" ? null : typeof salePrice === "number" ? salePrice : Number(salePrice);

  const headerBlock = (
    <div className={`shrink-0 border-b border-slate-200/90 bg-white ${isPage ? "px-3 py-2.5 sm:px-4" : "bg-slate-50/80 px-6 py-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {isPage ? (
            <button
              type="button"
              onClick={onClose}
              className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              aria-label="Wróć do listy zestawów"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          {imageUrl.trim() ? (
            <img src={imageUrl.trim()} alt="" className="h-12 w-12 shrink-0 rounded-md border border-slate-200 object-contain" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400">
              <Package className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {isNew ? "Nowy zestaw" : "Edycja zestawu"}
            </p>
            <h2 className="truncate text-base font-semibold text-slate-900 sm:text-lg">{name.trim() || (isNew ? "Bez nazwy" : "—")}</h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {!isNew && bundleId != null ? (
                <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                  ID {bundleId}
                </span>
              ) : null}
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${active ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                {active ? "Aktywny" : "Nieaktywny"}
              </span>
              {sku.trim() ? (
                <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                  SKU {sku.trim()}
                </span>
              ) : null}
              <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-900 ring-1 ring-violet-200">
                Wirtualny · bez własnego stanu
              </span>
              <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-900 ring-1 ring-blue-200">
                Cena {formatMoneyZl(salePriceNum)}
              </span>
              {bundleAvailability != null ? (
                <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900 ring-1 ring-emerald-200">
                  Dostępność ~{bundleAvailability}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const tabsBlock = (
    <div className="shrink-0 border-b border-slate-200/90 bg-white px-2 sm:px-3">
      <div className="flex gap-0.5 overflow-x-auto">
        {BUNDLE_EDIT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={activeTab === t.id ? appTabActiveClass : appTabInactiveClass}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );

  const tabContent = (
    <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${isPage ? "px-3 py-3 sm:px-4" : "px-6 py-6"}`}>
      {activeTab === "basic" && (
        <div className="grid gap-3 lg:grid-cols-[1fr_240px] lg:items-start">
          <AppSection title="Identyfikacja i cena">
            <div>
              <label className={appFieldLabelClass}>Nazwa *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={appInputClass} required />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className={appFieldLabelClass}>SKU</label>
                <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} className={appInputClass} />
              </div>
              <div>
                <label className={appFieldLabelClass}>EAN</label>
                <input type="text" value={ean} onChange={(e) => setEan(e.target.value)} className={appInputClass} />
              </div>
            </div>
            <div>
              <label className={appFieldLabelClass}>Cena sprzedaży (cały zestaw)</label>
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
                className={appInputClass}
                placeholder="Opcjonalnie"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Przy zamówieniu suma linii jest dopasowywana do tej wartości (proporcjonalnie do cen składowych).
              </p>
            </div>
            <div>
              <label className={appFieldLabelClass}>URL zdjęcia</label>
              <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={appInputClass} placeholder="https://…" />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-700">
              <input type="checkbox" className="rounded border-slate-300" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Aktywny (widoczny przy tworzeniu zamówień)
            </label>
          </AppSection>
          {imageUrl.trim() ? (
            <AppSection title="Podgląd zdjęcia">
              <img src={imageUrl.trim()} alt="" className="mx-auto max-h-36 rounded-md object-contain" />
            </AppSection>
          ) : null}
        </div>
      )}

      {activeTab === "products" && (
        <AppSection title="Skład zestawu">
          <p className="text-[11px] text-slate-600">
            Wyszukaj produkt po nazwie lub SKU. Duplikaty są scalane przy zapisie.
          </p>
          <div className="space-y-2">
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
            className="mt-1 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-[13px] font-semibold text-slate-800 hover:bg-slate-100"
          >
            + Dodaj produkt
          </button>
        </AppSection>
      )}

      {activeTab === "warehouse" && (
        <div className="space-y-3">
          <AppSection title="Dostępność wirtualna">
            <p className="text-[13px] text-slate-700">
              Zestaw nie ma własnego stanu magazynowego. Dostępność = min(stan składowej ÷ ilość w zestawie).
            </p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{bundleAvailability ?? "—"} szt.</p>
          </AppSection>
          <AppSection title="Składniki — stany">
            {rows.filter((r) => r.productId != null).length === 0 ? (
              <p className="text-[13px] text-slate-500">Dodaj produkty w zakładce Produkty.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200/90">
                {rows
                  .filter((r) => r.productId != null)
                  .map((r) => {
                    const c = productCache[r.productId!];
                    const qty = Math.max(1, Math.floor(r.quantity));
                    const st = c?.stock ?? 0;
                    const per = Math.floor(st / qty);
                    return (
                      <li key={r.rowKey} className="flex items-center justify-between gap-2 px-2.5 py-2 text-[13px]">
                        <span className="min-w-0 truncate font-medium text-slate-900">{c?.name ?? `#${r.productId}`}</span>
                        <span className="shrink-0 tabular-nums text-slate-600">
                          {st} ÷ {qty} = {per}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </AppSection>
        </div>
      )}

      {activeTab === "history" && (
        <AppEmptyState
          icon={History}
          title="Brak historii"
          description="Zmiany zestawu i powiązane operacje magazynowe pojawią się tutaj."
        />
      )}

      {activeTab === "logs" && (
        <AppEmptyState
          icon={ScrollText}
          title="Brak logów"
          description="Logi operacyjne i audyt edycji zestawu będą dostępne w kolejnej wersji."
        />
      )}

      {activeTab === "relations" && (
        <AppEmptyState
          icon={Link2}
          title="Brak powiązań"
          description="Powiązane zamówienia, oferty i dokumenty sprzedaży pojawią się tutaj."
        />
      )}

      {saveErr ? <p className="mt-3 text-[13px] text-red-600">{saveErr}</p> : null}
    </div>
  );

  const footerBlock = (
    <div className={`flex shrink-0 justify-end gap-2 border-t border-slate-200/90 bg-white ${isPage ? "px-3 py-2.5 sm:px-4" : "px-6 py-4"}`}>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
      >
        {isPage ? "Wróć do listy" : "Anuluj"}
      </button>
      <button
        type="submit"
        disabled={saving || !!loadErr}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {saving ? "Zapisywanie…" : isNew ? "Utwórz zestaw" : "Zapisz"}
      </button>
    </div>
  );

  const formInner = (
    <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
      {loadErr ? <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-[13px] text-red-800">{loadErr}</div> : null}
      {headerBlock}
      {tabsBlock}
      {tabContent}
      {footerBlock}
    </form>
  );

  if (isPage) {
    return <div className="flex min-h-[calc(100vh-5rem)] flex-col">{formInner}</div>;
  }

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex h-[88vh] max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {formInner}
      </div>
    </div>
  );
}
