import { memo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

import type { ProductForecastDetail } from "../../../api/purchasingForecastApi";
import { PurchasingProductThumbnail } from "./PurchasingProductThumbnail";
import { PurchasingProductMetaCard } from "./PurchasingProductMetaCard";
import { PurchasingRightDrawer } from "./PurchasingRightDrawer";
import {
  fetchProductDisplayMeta,
  type ProductDisplayMeta,
} from "./purchasingProductDisplayMeta";
import { getProductImage } from "./getProductImage";

type Props = {
  open: boolean;
  loading: boolean;
  detail: ProductForecastDetail | null;
  onClose: () => void;
  tenantId?: number;
  formatQty?: (unit: string | null | undefined, v: number | null | undefined) => string;
  incomingQty?: number | null;
};

function defaultFmtQty(_unit: string | null | undefined, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pl-PL", { maximumFractionDigits: 3 });
}

function PurchasingProductInspectorDrawerInner({
  open,
  loading,
  detail,
  onClose,
  tenantId,
  formatQty = defaultFmtQty,
  incomingQty,
}: Props) {
  const [productMeta, setProductMeta] = useState<ProductDisplayMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  const productId = detail?.product?.id ?? null;

  useEffect(() => {
    if (!open || tenantId == null || productId == null) {
      setProductMeta(null);
      return;
    }
    let cancelled = false;
    setMetaLoading(true);
    void fetchProductDisplayMeta(tenantId, productId)
      .then((meta) => {
        if (!cancelled) setProductMeta(meta);
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
  }, [open, tenantId, productId]);

  const pr = detail?.product;
  const u = detail?.unit ?? null;
  const displayName = productMeta?.name ?? pr?.name ?? "Produkt";
  const imageUrl = productMeta?.imageUrl ?? getProductImage(pr) ?? getProductImage(detail);
  const ean = productMeta?.ean ?? pr?.ean ?? null;
  const sku = productMeta?.sku ?? pr?.sku ?? null;

  return (
    <PurchasingRightDrawer
      open={open}
      onClose={onClose}
      ariaLabel="Inspektor produktu"
      header={
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Inspektor produktu</h2>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      }
    >
      <div className="p-4 text-sm text-slate-700">
        {loading ? (
          <p className="text-slate-500">Wczytywanie…</p>
        ) : detail && pr ? (
          <div className="space-y-4">
            <PurchasingProductMetaCard>
              <PurchasingProductThumbnail
                size="lg"
                imageUrl={imageUrl}
                name={displayName}
                sku={sku}
                stock={detail.stock}
                incomingQty={incomingQty}
                unit={u}
                hoverPreview={false}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{displayName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  SKU: {sku?.trim() ? sku : "—"}
                  <br />
                  EAN: {metaLoading ? "…" : ean?.trim() ? ean : "—"}
                </p>
                <Link
                  to={`/products/${pr.id}`}
                  className="mt-2 inline-block text-xs font-medium text-blue-600 hover:underline"
                >
                  Karta produktu →
                </Link>
              </div>
            </PurchasingProductMetaCard>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs">
              <dt className="text-slate-500">Dostawca</dt>
              <dd className="truncate text-right">{detail.supplier_name ?? "—"}</dd>
              <dt className="text-slate-500">Stan magazynowy</dt>
              <dd className="text-right font-medium tabular-nums">{formatQty(u, detail.stock)}</dd>
              {incomingQty != null ? (
                <>
                  <dt className="text-slate-500">W drodze</dt>
                  <dd className="text-right font-medium tabular-nums">{formatQty(u, incomingQty)}</dd>
                </>
              ) : null}
              <dt className="text-slate-500">Sprzedaż 30 dni</dt>
              <dd className="text-right tabular-nums">{formatQty(u, detail.sales_30d)}</dd>
              <dt className="text-slate-500">Średnio dziennie</dt>
              <dd className="text-right tabular-nums">{formatQty(u, detail.avg_daily)}</dd>
              <dt className="text-slate-500">Sugerowane zamówienie</dt>
              <dd className="text-right font-semibold tabular-nums text-teal-800">{formatQty(u, detail.suggested_qty)}</dd>
              <dt className="text-slate-500">Sprzedaż 7 / 90 dni</dt>
              <dd className="text-right tabular-nums">
                {formatQty(u, detail.sales_7d)} / {formatQty(u, detail.sales_90d)}
              </dd>
              <dt className="text-slate-500">Prognoza 30 dni</dt>
              <dd className="text-right tabular-nums text-teal-800">{formatQty(u, detail.forecast_30d)}</dd>
              {detail.lead_time_days != null ? (
                <>
                  <dt className="text-slate-500">Czas realizacji</dt>
                  <dd className="text-right">{detail.lead_time_days} d</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : (
          <p className="text-slate-500">Brak danych dla wybranego produktu.</p>
        )}
      </div>
    </PurchasingRightDrawer>
  );
}

export const PurchasingProductInspectorDrawer = memo(PurchasingProductInspectorDrawerInner);
