import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Link2, MoreHorizontal, ScrollText } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  createBundle,
  getBundle,
  updateBundle,
  type BundleRead,
} from "../../api/bundlesApi";
import api from "../../api/axios";
import {
  ProductLikePageLayout,
  ProductLikeSection,
  productLikeFieldLabelClass,
  productLikeInputClass,
  productLikeMainAsideClass,
  productLikeSideColClass,
  productLikeThreeColClass,
  type ProductLikeMetaChip,
} from "../../components/catalog";
import { AppEmptyState } from "../../components/app-shell";
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
        setSearchParams(
          (prev) => {
            const n = new URLSearchParams(prev);
            n.set("tab", tab);
            return n;
          },
          { replace: true },
        );
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

  const metaChips: ProductLikeMetaChip[] = [
    ...(!isNew && bundleId != null ? [{ label: "ID", value: bundleId }] : []),
    { label: "SKU", value: sku.trim() || "—" },
    { label: "EAN", value: ean.trim() || "—" },
    {
      label: "Status",
      value: active ? "Aktywny" : "Nieaktywny",
      variant: active ? "emerald" : "default",
    },
    { label: "Typ", value: "Wirtualny zestaw" },
    { label: "Cena", value: formatMoneyZl(salePriceNum), variant: "emerald" },
    {
      label: "Dostępność",
      value: bundleAvailability != null ? `~${bundleAvailability} szt.` : "—",
      variant: "blue",
    },
  ];

  const headerActions = (
    <>
      <details className="relative">
        <summary className="flex list-none cursor-pointer items-center justify-center rounded border border-slate-300 bg-white p-2 text-slate-600 shadow-sm transition-colors marker:content-none hover:bg-slate-50 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
          <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
        </summary>
        <div className="absolute right-0 z-50 mt-2 w-48 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-xl">
          <Link to="/bundles" className="block px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600">
            Wróć do listy
          </Link>
        </div>
      </details>
    </>
  );

  return (
    <ProductLikePageLayout
      variant={isPage ? "page" : "modal"}
      onModalClose={onClose}
      modeLabel={isNew ? "Dodawanie zestawu" : "Edycja zestawu"}
      title={name.trim() || (isNew ? "Nowy zestaw" : "—")}
      imageUrl={imageUrl}
      metaChips={metaChips}
      headerActions={headerActions}
      tabs={BUNDLE_EDIT_TABS}
      activeTab={activeTab}
      onTabChange={setTab}
      onSubmit={handleSubmit}
      saving={saving}
      saveDisabled={!!loadErr}
      saveLabel={isNew ? "Utwórz zestaw" : "Zapisz"}
      loadError={loadErr}
      footerExtra={
        !isPage ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Anuluj
          </button>
        ) : null
      }
    >
      {activeTab === "basic" && (
        <div className={productLikeThreeColClass}>
          <div className={productLikeSideColClass}>
            <ProductLikeSection title="Informacje ogólne">
              <div className="space-y-5">
                <div>
                  <label className={productLikeFieldLabelClass}>Nazwa *</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={productLikeInputClass} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={productLikeFieldLabelClass}>Symbol / SKU</label>
                    <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} className={productLikeInputClass} />
                  </div>
                  <div>
                    <label className={productLikeFieldLabelClass}>EAN</label>
                    <input type="text" value={ean} onChange={(e) => setEan(e.target.value)} className={productLikeInputClass} />
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="rounded border-slate-300 text-blue-600" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  Aktywny (widoczny przy tworzeniu zamówień)
                </label>
              </div>
            </ProductLikeSection>
          </div>

          <div className={productLikeSideColClass}>
            <ProductLikeSection title="Cena i prezentacja">
              <div className="space-y-5">
                <div>
                  <label className={productLikeFieldLabelClass}>Cena sprzedaży (cały zestaw)</label>
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
                    className={productLikeInputClass}
                    placeholder="Opcjonalnie"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Przy zamówieniu suma linii jest dopasowywana do tej wartości (proporcjonalnie do cen składowych).
                  </p>
                </div>
                <div>
                  <label className={productLikeFieldLabelClass}>URL zdjęcia</label>
                  <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={productLikeInputClass} placeholder="https://…" />
                </div>
              </div>
            </ProductLikeSection>
          </div>

          {!isNew ? (
            <aside className={productLikeMainAsideClass}>
              <ProductLikeSection title="Historia magazynowa">
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <AppEmptyState
                    icon={History}
                    title="Brak operacji magazynowych"
                    description="Zestaw wirtualny — historia ruchów dotyczy składowych produktów."
                    density="compact"
                  />
                </div>
              </ProductLikeSection>
            </aside>
          ) : null}
        </div>
      )}

      {activeTab === "products" && (
        <div className="w-full xl:max-w-4xl space-y-6">
          <ProductLikeSection title="Skład zestawu">
            <p className="mb-4 text-sm text-slate-600">
              Wyszukaj produkt po nazwie lub SKU. Duplikaty są scalane przy zapisie.
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
              className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              + Dodaj produkt
            </button>
          </ProductLikeSection>
        </div>
      )}

      {activeTab === "warehouse" && (
        <div className={productLikeThreeColClass}>
          <div className={productLikeSideColClass}>
            <ProductLikeSection title="Dostępność wirtualna">
              <p className="text-sm text-slate-700">
                Zestaw nie ma własnego stanu magazynowego. Dostępność = min(stan składowej ÷ ilość w zestawie).
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{bundleAvailability ?? "—"} szt.</p>
            </ProductLikeSection>
          </div>
          <div className={productLikeMainAsideClass}>
            <ProductLikeSection title="Składniki — stany">
              {rows.filter((r) => r.productId != null).length === 0 ? (
                <p className="text-sm text-slate-500">Dodaj produkty w zakładce Produkty.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full min-w-[32rem] text-sm text-left">
                    <thead className="border-b border-slate-200 bg-white text-xs font-semibold text-slate-700">
                      <tr>
                        <th className="px-5 py-3.5">Produkt</th>
                        <th className="px-5 py-3.5 text-right">Stan ÷ ilość</th>
                        <th className="px-5 py-3.5 text-right">Max zest.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600">
                      {rows
                        .filter((r) => r.productId != null)
                        .map((r) => {
                          const c = productCache[r.productId!];
                          const qty = Math.max(1, Math.floor(r.quantity));
                          const st = c?.stock ?? 0;
                          const per = Math.floor(st / qty);
                          return (
                            <tr key={r.rowKey}>
                              <td className="px-5 py-3.5 font-medium text-slate-900">{c?.name ?? `#${r.productId}`}</td>
                              <td className="px-5 py-3.5 text-right tabular-nums">
                                {st} ÷ {qty}
                              </td>
                              <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-900">{per}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </ProductLikeSection>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <AppEmptyState icon={History} title="Brak historii" description="Zmiany zestawu i powiązane operacje pojawią się tutaj." />
      )}

      {activeTab === "logs" && (
        <AppEmptyState icon={ScrollText} title="Brak logów" description="Logi operacyjne i audyt edycji zestawu będą dostępne w kolejnej wersji." />
      )}

      {activeTab === "relations" && (
        <AppEmptyState icon={Link2} title="Brak powiązań" description="Powiązane zamówienia, oferty i dokumenty sprzedaży pojawią się tutaj." />
      )}

      {saveErr ? <p className="mt-4 text-sm text-red-600">{saveErr}</p> : null}
    </ProductLikePageLayout>
  );
}
