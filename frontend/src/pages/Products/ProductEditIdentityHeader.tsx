import { Layers3 } from "lucide-react";

import { GhostButton, Input } from "../../design-system";
import { ProductCodeGenerateControl } from "./ProductCodeGenerateControl";
import {
  pimFieldLabelClass,
  pimIconBadgeClass,
  pimPanelIdentityClass,
} from "../Assortment/pimUi";

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
 * Top-of-card identity: Category, SKU+Generuj, Catalog+Generuj, Status.
 * Family management lives exclusively on the Rodzina tab.
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
  const statusLabel = isNew ? "Szkic" : "Aktywny";

  return (
    <section className={pimPanelIdentityClass}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={pimIconBadgeClass}>
            <Layers3 className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Tożsamość produktu</h2>
            <p className="text-xs text-slate-500">Kategoria · SKU · katalog · status</p>
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
          <span className={pimFieldLabelClass}>Kategoria</span>
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

        <div className="hidden lg:block" aria-hidden />

        <div>
          <span className={pimFieldLabelClass}>SKU</span>
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
          <span className={pimFieldLabelClass}>Numer katalogowy</span>
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
