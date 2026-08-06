import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Layers3 } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import {
  attachProductFamily,
  getProductFamilyState,
  listProductFamilies,
  type ProductFamilyListItem,
} from "../../api/productFamiliesApi";
import { extractApiErrorMessage } from "../../api/authApi";
import { GhostButton, Input, PrimaryButton, Select } from "../../design-system";
import { ProductCodeGenerateControl } from "./ProductCodeGenerateControl";

type Props = {
  isNew: boolean;
  tenantId: number | null;
  productId?: number | null;
  symbol: string;
  setSymbol: (v: string) => void;
  catalogNumber: string;
  setCatalogNumber: (v: string) => void;
  primaryCategoryId: number | null;
  primaryCategoryPath: string | null;
  onOpenCategoriesTab: () => void;
};

/**
 * Top-of-card identity: Family, Category, SKU+Generuj, Catalog+Generuj, Status.
 */
export function ProductEditIdentityHeader({
  isNew,
  tenantId,
  productId,
  symbol,
  setSymbol,
  catalogNumber,
  setCatalogNumber,
  primaryCategoryId,
  primaryCategoryPath,
  onOpenCategoriesTab,
}: Props) {
  const [families, setFamilies] = useState<ProductFamilyListItem[]>([]);
  const [draftFamilyId, setDraftFamilyId] = useState("");
  const [familyName, setFamilyName] = useState<string | null>(null);
  const [familyBusy, setFamilyBusy] = useState(false);
  const [familyLoading, setFamilyLoading] = useState(false);

  const reloadFamily = useCallback(async () => {
    if (tenantId == null || productId == null) {
      setDraftFamilyId("");
      setFamilyName(null);
      setFamilies([]);
      return;
    }
    setFamilyLoading(true);
    try {
      const [st, list] = await Promise.all([
        getProductFamilyState(tenantId, productId),
        listProductFamilies(tenantId, { includeInactive: false }),
      ]);
      setFamilies(list);
      setDraftFamilyId(st.product_family_id != null ? String(st.product_family_id) : "");
      setFamilyName(st.family?.name ?? null);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wczytać rodziny."));
    } finally {
      setFamilyLoading(false);
    }
  }, [tenantId, productId]);

  useEffect(() => {
    void reloadFamily();
  }, [reloadFamily]);

  const onSaveFamily = async () => {
    if (tenantId == null || productId == null) return;
    const nextId = draftFamilyId.trim() ? Number(draftFamilyId) : null;
    if (draftFamilyId.trim() && !Number.isFinite(nextId)) {
      toast.error("Nieprawidłowa rodzina.");
      return;
    }
    setFamilyBusy(true);
    try {
      const st = await attachProductFamily(tenantId, productId, nextId);
      setDraftFamilyId(st.product_family_id != null ? String(st.product_family_id) : "");
      setFamilyName(st.family?.name ?? null);
      toast.success(nextId == null ? "Odłączono od rodziny." : "Przypisano do rodziny.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się zmienić rodziny."));
    } finally {
      setFamilyBusy(false);
    }
  };

  const statusLabel = isNew ? "Szkic" : "Aktywny";

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white">
            <Layers3 className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Tożsamość produktu</h2>
            <p className="text-xs text-slate-500">Rodzina · kategoria · SKU · katalog · status</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            isNew ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Rodzina
          </span>
          {isNew || productId == null || tenantId == null ? (
            <p className="text-sm text-slate-500">Dostępne po zapisaniu produktu.</p>
          ) : familyLoading ? (
            <p className="text-sm text-slate-500">Ładowanie…</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <Select
                  value={draftFamilyId}
                  disabled={familyBusy}
                  onChange={(e) => setDraftFamilyId(e.target.value)}
                  className="min-w-[12rem] flex-1"
                >
                  <option value="">— Brak —</option>
                  {families.map((f) => (
                    <option key={f.id} value={String(f.id)}>
                      {f.name}
                    </option>
                  ))}
                </Select>
                <PrimaryButton
                  type="button"
                  density="compact"
                  disabled={familyBusy}
                  onClick={() => void onSaveFamily()}
                >
                  Zapisz
                </PrimaryButton>
              </div>
              {familyName && draftFamilyId ? (
                <Link
                  to={`/product-families/${draftFamilyId}/edit`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                >
                  Otwórz {familyName}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              ) : null}
            </div>
          )}
        </div>

        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Kategoria
          </span>
          {primaryCategoryPath ? (
            <p className="text-sm font-medium text-slate-900">{primaryCategoryPath}</p>
          ) : (
            <p className="text-sm text-slate-500">
              {primaryCategoryId != null
                ? `Kategoria #${primaryCategoryId}`
                : isNew
                  ? "Kategorię ustawisz po zapisie w zakładce Kategorie."
                  : "Brak kategorii głównej"}
            </p>
          )}
          {!isNew ? (
            <GhostButton type="button" density="compact" className="mt-1" onClick={onOpenCategoriesTab}>
              Zmień w zakładce Kategorie
            </GhostButton>
          ) : null}
        </div>

        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            SKU
          </span>
          <div className="flex items-stretch gap-2">
            <Input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              density="comfortable"
              focusTone="brand"
              className="min-w-0 flex-1 font-mono text-xs"
              placeholder="Symbol / SKU"
            />
            <ProductCodeGenerateControl
              kind="sku"
              tenantId={tenantId}
              productId={productId}
              primaryCategoryId={primaryCategoryId}
              currentValue={symbol}
              onGenerated={setSymbol}
            />
          </div>
        </div>

        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Numer katalogowy
          </span>
          <div className="flex items-stretch gap-2">
            <Input
              type="text"
              value={catalogNumber}
              onChange={(e) => setCatalogNumber(e.target.value)}
              density="comfortable"
              focusTone="brand"
              className="min-w-0 flex-1 font-mono text-xs"
              placeholder="Opcjonalne"
            />
            <ProductCodeGenerateControl
              kind="catalog"
              tenantId={tenantId}
              productId={productId}
              primaryCategoryId={primaryCategoryId}
              currentValue={catalogNumber}
              onGenerated={setCatalogNumber}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
