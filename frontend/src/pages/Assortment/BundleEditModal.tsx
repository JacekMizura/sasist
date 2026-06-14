import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, ImageUp, Link2, MoreHorizontal, ScrollText } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  createBundle,
  getBundle,
  updateBundle,
  type BundleRead,
} from "../../api/bundlesApi";
import api from "../../api/axios";
import {
  CatalogEntityGallerySection,
  ProductLikePageLayout,
  ProductLikeSection,
  productLikeFieldLabelClass,
  productLikeInputClass,
  productLikeThreeColClass,
  productLikeSideColClass,
  useCatalogEntityGallery,
  type ProductLikeStatCard,
} from "../../components/catalog";
import { AppEmptyState } from "../../components/app-shell";
import { ensureSingleMainImage, parseProductImages, pickMainImageUrl } from "../../utils/productLabelMetadata";
import type { ProductImageEntry } from "../../types/productLabel";
import { BundleLabelTab } from "./BundleLabelTab";
import { BundleProductsTab } from "./BundleProductsTab";
import { BundleWarehouseTab } from "./BundleWarehouseTab";
import { EntityProductionPanel } from "../Production/EntityProductionPanel";
import {
  BUNDLE_FULFILLMENT_LABEL,
  BUNDLE_TYPE_HEADER_LABEL,
  normalizeFulfillmentMode,
  normalizeStockMode,
  type BundleFulfillmentMode,
  type BundleStockMode,
} from "../Production/bundleOperationalTypes";
import {
  buildBundleEditTabs,
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

function buildBundleMetadataJson(
  existing: string | null | undefined,
  images: ProductImageEntry[],
): string | undefined {
  let root: Record<string, unknown> = {};
  if (existing?.trim()) {
    try {
      const parsed = JSON.parse(existing) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        root = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      root = {};
    }
  }
  const imgs = ensureSingleMainImage(images);
  if (imgs.length) root.product_images = imgs;
  else delete root.product_images;
  return Object.keys(root).length ? JSON.stringify(root) : undefined;
}

function parseDim(v: number | null | undefined): number | "" {
  if (v == null || !Number.isFinite(Number(v))) return "";
  return Number(v);
}

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
  const headerGalleryInputRef = useRef<HTMLInputElement>(null);

  const tabFromUrl = searchParams.get("tab") as BundleEditTabId | null;
  const bundleTabs = useMemo(() => buildBundleEditTabs(isNew), [isNew]);
  const validTab = bundleTabs.some((t) => t.id === tabFromUrl) ? tabFromUrl! : null;
  const [activeTab, setActiveTab] = useState<BundleEditTabId>(initialTab ?? validTab ?? "basic");

  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [ean, setEan] = useState("");
  const [active, setActive] = useState(true);
  const [salePrice, setSalePrice] = useState<number | "">("");
  const [lengthMm, setLengthMm] = useState<number | "">("");
  const [widthMm, setWidthMm] = useState<number | "">("");
  const [heightMm, setHeightMm] = useState<number | "">("");
  const [weightKg, setWeightKg] = useState<number | "">("");
  const [metadataJson, setMetadataJson] = useState<string | null>(null);
  const [fulfillmentMode, setFulfillmentMode] = useState<BundleFulfillmentMode>("assembly");
  const [stockMode, setStockMode] = useState<BundleStockMode>("virtual");
  const [linkedProductId, setLinkedProductId] = useState<number | null>(null);
  const [physicalStock, setPhysicalStock] = useState<number | null>(null);

  const {
    images: galleryImages,
    resetGallery,
    newUrl: galleryNewUrl,
    setNewUrl: setGalleryNewUrl,
    uploadBusy: galleryUploadBusy,
    addFromUrl: galleryAddFromUrl,
    onFileInputChange: galleryOnFileInputChange,
    setMain: gallerySetMain,
    remove: galleryRemove,
    move: galleryMove,
    updateUrl: galleryUpdateUrl,
  } = useCatalogEntityGallery();
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
        imageUrl: typeof p.image_url === "string" && p.image_url.trim() ? p.image_url.trim() : null,
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
              image_url: data.image_url as string | null,
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
    setLengthMm("");
    setWidthMm("");
    setHeightMm("");
    setWeightKg("");
    setMetadataJson(null);
    setFulfillmentMode("assembly");
    setStockMode("virtual");
    setLinkedProductId(null);
    setPhysicalStock(null);
    resetGallery([]);
    setRows([emptyRow()]);
    setProductCache({});
  }, [initialTab, resetGallery]);

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
        setLengthMm(parseDim(b.length_mm));
        setWidthMm(parseDim(b.width_mm));
        setHeightMm(parseDim(b.height_mm));
        setWeightKg(parseDim(b.weight_kg));
        setMetadataJson(b.metadata_json ?? null);
        setFulfillmentMode(normalizeFulfillmentMode(b.fulfillment_mode));
        setStockMode(normalizeStockMode(b.stock_mode));
        setLinkedProductId(b.linked_product_id ?? null);
        setPhysicalStock(b.physical_stock ?? null);

        let metaParsed: unknown = null;
        if (b.metadata_json?.trim()) {
          try {
            metaParsed = JSON.parse(b.metadata_json);
          } catch {
            metaParsed = null;
          }
        }
        const imgs = parseProductImages(metaParsed);
        if (imgs.length > 0) {
          resetGallery(imgs);
        } else if ((b.image_url ?? "").trim()) {
          resetGallery([
            { id: "legacy-main", image_url: (b.image_url ?? "").trim(), is_main: true, sort_order: 0 },
          ]);
        } else {
          resetGallery([]);
        }

        const seed: Record<number, ProductSummary> = {};
        for (const it of b.items) {
          seed[it.product_id] = {
            name: (it.product_name ?? `Produkt #${it.product_id}`).trim(),
            sku: (it.product_sku ?? "").trim(),
            ean: null,
            stock: it.product_stock ?? 0,
            imageUrl: null,
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
  }, [open, isPage, isNew, bundleId, tenantId, resetForm, prefetchProductDetails, resetGallery]);

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

  const pickProductFromSearch = useCallback(
    (p: CatalogProduct) => {
      mergeProductIntoCache(p);
      setRows((prev) => {
        const dup = prev.findIndex((r) => r.productId === p.id);
        if (dup >= 0) {
          const next = [...prev];
          next[dup] = { ...next[dup], quantity: next[dup].quantity + 1 };
          return next;
        }
        const emptyIdx = prev.findIndex((r) => r.productId == null);
        if (emptyIdx >= 0) {
          const next = [...prev];
          next[emptyIdx] = {
            ...next[emptyIdx],
            productId: p.id,
            quantity: 1,
            searchText: "",
            listOpen: false,
            importMetaSummary: null,
          };
          return next;
        }
        return [...prev, { ...emptyRow(), productId: p.id, quantity: 1 }];
      });
    },
    [mergeProductIntoCache],
  );

  const updateRowQuantity = useCallback((rowIndex: number, q: number) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], quantity: q };
      return next;
    });
  }, []);

  const removeRow = useCallback((rowIndex: number) => {
    setRows((prev) => prev.filter((_, j) => j !== rowIndex));
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
    const mainImage = pickMainImageUrl(ensureSingleMainImage(galleryImages)) ?? "";
    const metaStr = buildBundleMetadataJson(metadataJson, galleryImages);
    const dim = (v: number | "") => (v === "" ? null : typeof v === "number" && Number.isFinite(v) ? v : null);

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim() || null,
        ean: ean.trim() || null,
        sale_price: sp != null && Number.isFinite(sp) ? sp : null,
        active,
        image_url: mainImage || null,
        length_mm: dim(lengthMm),
        width_mm: dim(widthMm),
        height_mm: dim(heightMm),
        weight_kg: dim(weightKg),
        metadata_json: metaStr ?? null,
        fulfillment_mode: fulfillmentMode,
        stock_mode: stockMode,
        linked_product_id: linkedProductId,
        items,
      };
      if (isNew) {
        const created = await createBundle({ tenant_id: tenantId, ...payload });
        onSaved();
        onCreated?.(created);
        if (isPage) {
          navigate(`/bundles/${created.id}/edit`, { replace: true });
        } else {
          onClose();
        }
      } else {
        await updateBundle(tenantId, bundleId!, payload);
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
  const headerPreviewUrl = pickMainImageUrl(ensureSingleMainImage(galleryImages));

  const statCards: ProductLikeStatCard[] = [
    {
      label: stockMode === "physical" ? "Stan magazynu" : "Dostępność",
      value:
        stockMode === "physical" && physicalStock != null
          ? `${physicalStock} szt.`
          : bundleAvailability != null
            ? `${bundleAvailability} szt.`
            : "—",
      subValue:
        stockMode === "physical"
          ? "Zestaw fizyczny"
          : fulfillmentMode === "assembly"
            ? "Kompletacja · ze składników"
            : "Ze składników",
      variant: "blue",
    },
    {
      label: "Cena",
      value: formatMoneyZl(salePriceNum),
      variant: "green",
    },
    {
      label: "Status",
      value: active ? "Aktywny" : "Nieaktywny",
      variant: active ? "green" : "slate",
    },
  ];

  const headerActions = (
    <>
      <button
        type="button"
        title={galleryUploadBusy ? "Wgrywanie…" : "Wgraj zdjęcie"}
        disabled={galleryUploadBusy}
        onClick={() => headerGalleryInputRef.current?.click()}
        className="flex items-center justify-center rounded border border-slate-300 bg-white p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
      >
        <ImageUp className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
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

  const fieldLabel = productLikeFieldLabelClass;
  const inputClass = productLikeInputClass;

  return (
    <ProductLikePageLayout
      variant={isPage ? "page" : "modal"}
      onModalClose={onClose}
      stickyHeader={!isPage}
      hideVerticalRail={isPage}
      showTabIcons={isPage}
      saveInHeader={isPage}
      hideModeLabel={isPage}
      saveLabel={isNew ? "Utwórz zestaw" : "Zapisz zmiany"}
      breadcrumbs={
        isPage
          ? [
              { label: "Zestawy", onClick: () => navigate("/bundles") },
              { label: isNew ? "Nowy zestaw" : "Edycja zestawu" },
            ]
          : undefined
      }
      headerPrefix={
        <input
          ref={headerGalleryInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={galleryOnFileInputChange}
          disabled={galleryUploadBusy}
        />
      }
      modeLabel={isNew ? "Dodawanie zestawu" : "Edycja zestawu"}
      title={name.trim() || (isNew ? "Nowy zestaw" : "—")}
      titleBadge={
        !isNew ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-900">
              {BUNDLE_TYPE_HEADER_LABEL[stockMode]}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
              {BUNDLE_FULFILLMENT_LABEL[fulfillmentMode]}
            </span>
          </div>
        ) : undefined
      }
      imageUrl={headerPreviewUrl}
      statCards={statCards}
      productIdentifiers={{
        productId: !isNew && bundleId != null ? bundleId : undefined,
        sku,
        ean,
      }}
      headerActions={headerActions}
      tabs={bundleTabs}
      activeTab={activeTab}
      onTabChange={setTab}
      onSubmit={handleSubmit}
      saving={saving}
      saveDisabled={!!loadErr}
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
                  <label className={fieldLabel}>Nazwa *</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={fieldLabel}>Symbol / SKU</label>
                    <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={fieldLabel}>EAN</label>
                    <input type="text" value={ean} onChange={(e) => setEan(e.target.value)} className={inputClass} />
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
            <ProductLikeSection title="Cena">
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
                  Przy zamówieniu suma linii jest dopasowywana do tej wartości (proporcjonalnie do cen składowych).
                </p>
              </div>
            </ProductLikeSection>

            <ProductLikeSection title="Wymiary opakowania zestawu" className="mt-6">
              <p className="mb-4 text-xs text-slate-500">
                Wymiary gotowego opakowania (kartonu) — nie składników. Używane w magazynie, pakowaniu i etykietach.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={fieldLabel}>Długość (mm)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={lengthMm === "" ? "" : lengthMm}
                    onChange={(e) => {
                      const s = e.target.value.trim();
                      if (s === "") setLengthMm("");
                      else {
                        const n = parseFloat(s);
                        if (Number.isFinite(n)) setLengthMm(n);
                      }
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={fieldLabel}>Szerokość (mm)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={widthMm === "" ? "" : widthMm}
                    onChange={(e) => {
                      const s = e.target.value.trim();
                      if (s === "") setWidthMm("");
                      else {
                        const n = parseFloat(s);
                        if (Number.isFinite(n)) setWidthMm(n);
                      }
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={fieldLabel}>Wysokość (mm)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={heightMm === "" ? "" : heightMm}
                    onChange={(e) => {
                      const s = e.target.value.trim();
                      if (s === "") setHeightMm("");
                      else {
                        const n = parseFloat(s);
                        if (Number.isFinite(n)) setHeightMm(n);
                      }
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={fieldLabel}>Waga (kg)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    value={weightKg === "" ? "" : weightKg}
                    onChange={(e) => {
                      const s = e.target.value.trim().replace(",", ".");
                      if (s === "") setWeightKg("");
                      else {
                        const n = parseFloat(s);
                        if (Number.isFinite(n)) setWeightKg(n);
                      }
                    }}
                    className={inputClass}
                  />
                </div>
              </div>
            </ProductLikeSection>
          </div>
        </div>
      )}

      {activeTab === "products" && (
        <BundleProductsTab
          tenantId={tenantId}
          rows={rows}
          productCache={productCache}
          onPick={pickProductFromSearch}
          onQuantity={updateRowQuantity}
          onRemove={removeRow}
          mergeProductIntoCache={mergeProductIntoCache}
        />
      )}

      {activeTab === "warehouse" && (
        <BundleWarehouseTab
          rows={rows}
          productCache={productCache}
          bundleAvailability={bundleAvailability}
          fulfillmentMode={fulfillmentMode}
          stockMode={stockMode}
          physicalStock={physicalStock}
        />
      )}

      {activeTab === "production" && (
        <EntityProductionPanel
          entityType="bundle"
          tenantId={tenantId}
          isNew={isNew}
          bundleName={name.trim() || "Zestaw"}
          fulfillmentMode={fulfillmentMode}
          stockMode={stockMode}
          linkedProductId={linkedProductId}
          onFulfillmentModeChange={setFulfillmentMode}
          onStockModeChange={setStockMode}
          onLinkedProductIdChange={setLinkedProductId}
          rows={rows}
          productCache={productCache}
          bundleAvailability={bundleAvailability}
        />
      )}

      {activeTab === "images" && (
        <CatalogEntityGallerySection
          title="Galeria zestawu"
          images={galleryImages}
          newUrl={galleryNewUrl}
          uploadBusy={galleryUploadBusy}
          onNewUrlChange={setGalleryNewUrl}
          onAddUrl={galleryAddFromUrl}
          onFileSelected={galleryOnFileInputChange}
          onSetMain={gallerySetMain}
          onMove={galleryMove}
          onRemove={galleryRemove}
          onUpdateUrl={galleryUpdateUrl}
        />
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

      {activeTab === "labelSheet" && <BundleLabelTab bundleId={bundleId} tenantId={tenantId} isNew={isNew} />}

      {saveErr ? <p className="mt-4 text-sm text-red-600">{saveErr}</p> : null}
    </ProductLikePageLayout>
  );
}
