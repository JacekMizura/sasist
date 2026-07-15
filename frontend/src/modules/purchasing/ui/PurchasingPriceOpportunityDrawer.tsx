import { memo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

import type { PriceOpportunityDrawer, PriceOpportunityRow, PriceOpportunityType } from "../../../api/purchasingPriceOpportunitiesApi";
import { PurchasingProductThumbnail } from "./PurchasingProductThumbnail";
import {
  fetchProductDisplayMeta,
  type ProductDisplayMeta,
} from "./purchasingProductDisplayMeta";

type Props = {
  open: boolean;
  row: PriceOpportunityRow;
  drawer: PriceOpportunityDrawer | null;
  drawerLoading: boolean;
  tenantId: number;
  typeLabel: string;
  typeBadgeClass: string;
  onClose: () => void;
  onDismiss: (row: PriceOpportunityRow) => void;
  onMetaLoaded?: (productId: number, meta: ProductDisplayMeta) => void;
  formatNum: (n: number | null | undefined, opts?: Intl.NumberFormatOptions) => string;
};

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-0.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="truncate font-medium text-slate-900">{value?.trim() ? value : "—"}</span>
    </div>
  );
}

function PurchasingPriceOpportunityDrawerInner({
  open,
  row,
  drawer,
  drawerLoading,
  tenantId,
  typeLabel,
  typeBadgeClass,
  onClose,
  onDismiss,
  onMetaLoaded,
  formatNum,
}: Props) {
  const [productMeta, setProductMeta] = useState<ProductDisplayMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || row.product_id == null) {
      setProductMeta(null);
      return;
    }
    let cancelled = false;
    setMetaLoading(true);
    void fetchProductDisplayMeta(tenantId, row.product_id)
      .then((meta) => {
        if (!cancelled) {
          setProductMeta(meta);
          onMetaLoaded?.(row.product_id!, meta);
        }
      })
      .catch(() => {
        if (!cancelled) setProductMeta(null);
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, row.product_id, tenantId, onMetaLoaded]);

  if (!open || typeof document === "undefined") return null;

  const displayName = productMeta?.name ?? row.product_name;
  const imageUrl = productMeta?.imageUrl ?? null;
  const ean = productMeta?.ean ?? null;
  const sku = productMeta?.sku ?? null;
  const category = productMeta?.category ?? null;
  const brand = productMeta?.brand ?? null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[59] bg-black/30"
        role="presentation"
        aria-hidden
        onClick={onClose}
      />
      <aside
        className="fixed inset-0 z-[60] flex flex-col bg-white lg:inset-y-0 lg:left-auto lg:w-[420px] lg:shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Szczegóły okazji cenowej"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Szczegóły produktu</p>
            <h2 className="mt-1 line-clamp-2 text-lg font-semibold text-slate-900">{displayName}</h2>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${typeBadgeClass}`}>
              {typeLabel}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            <X className="mr-1 h-4 w-4" aria-hidden />
            Zamknij
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-safe">
          <div className="flex gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <PurchasingProductThumbnail
              size="lg"
              imageUrl={imageUrl}
              name={displayName}
              sku={sku}
              hoverPreview={false}
              className="shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              {metaLoading ? (
                <p className="text-xs text-slate-500">Wczytywanie danych produktu…</p>
              ) : (
                <>
                  <MetaRow label="EAN" value={ean} />
                  <MetaRow label="SKU" value={sku} />
                  <MetaRow label="Kategoria" value={category} />
                  <MetaRow label="Marka" value={brand} />
                </>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-4 text-sm text-slate-700">
            {row.product_id == null ? (
              <p className="text-slate-600">Brak powiązania z pojedynczym SKU — wybierz wiersz z produktem.</p>
            ) : drawerLoading ? (
              <p className="text-slate-500">Wczytywanie historii…</p>
            ) : drawer ? (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Wolumen (szac.)</p>
                  <p className="mt-1 text-slate-800">
                    Zakupy / mies.:{" "}
                    <span className="font-mono">{formatNum(drawer.monthly_purchase_units, { maximumFractionDigits: 2 })}</span>{" "}
                    szt.
                    <br />
                    Sprzedaż / mies.:{" "}
                    <span className="font-mono">{formatNum(drawer.monthly_sales_units, { maximumFractionDigits: 2 })}</span>{" "}
                    szt.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Historia cen (PO i dostawy)</p>
                  {drawer.price_history.length === 0 ? (
                    <p className="mt-1 text-slate-600">Brak wystarczających danych.</p>
                  ) : (
                    <ul className="mt-1 max-h-48 overflow-auto rounded border border-slate-100">
                      {drawer.price_history.map((h, i) => (
                        <li key={i} className="flex justify-between border-b border-slate-50 px-2 py-1 text-xs">
                          <span className="text-slate-600">{h.date.slice(0, 16)}</span>
                          <span className="font-mono text-slate-900">{formatNum(h.unit_price, { maximumFractionDigits: 4 })}</span>
                          <span className="text-slate-500">{h.source === "delivery" ? "Dostawa" : "PO"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Porównanie dostawców (katalog)</p>
                  {drawer.supplier_offers.length === 0 ? (
                    <p className="mt-1 text-slate-600">Brak wystarczających danych.</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {drawer.supplier_offers.map((o) => (
                        <li key={o.supplier_id} className="flex justify-between rounded border border-slate-100 px-2 py-1">
                          <span>{o.supplier_name}</span>
                          <span className="font-mono">{formatNum(o.purchase_price, { maximumFractionDigits: 4 })} PLN</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <p className="text-slate-600">Brak danych do szczegółów.</p>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white p-4 pb-safe">
          <div className="flex flex-col gap-2">
            <Link
              className="rounded-lg bg-slate-900 px-3 py-2.5 text-center text-sm font-medium text-white hover:bg-slate-800"
              to={`/purchasing/plan?tenant_id=${tenantId}&supplier_id=${row.supplier_id}${
                row.product_id != null ? `&search=${encodeURIComponent(row.product_name)}` : ""
              }`}
            >
              Dodaj do zamówienia (generator)
            </Link>
            <Link
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-center text-sm font-medium text-slate-800 hover:bg-slate-50"
              to={`/suppliers?tenant_id=${tenantId}&edit=${row.supplier_id}`}
            >
              Karta dostawcy
            </Link>
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={() => onDismiss(row)}
            >
              Oznacz jako zignorowane
            </button>
          </div>
        </div>
      </aside>
    </>,
    document.body,
  );
}

export const PurchasingPriceOpportunityDrawer = memo(PurchasingPriceOpportunityDrawerInner);
