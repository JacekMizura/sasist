import { memo } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

import type { ProductForecastDetail } from "../../../api/purchasingForecastApi";
import { PurchasingProductThumbnail } from "./PurchasingProductThumbnail";

type Props = {
  open: boolean;
  loading: boolean;
  detail: ProductForecastDetail | null;
  onClose: () => void;
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
  formatQty = defaultFmtQty,
  incomingQty,
}: Props) {
  if (!open) return null;

  const pr = detail?.product;
  const u = detail?.unit ?? null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Inspektor produktu"
        onClick={(e) => e.stopPropagation()}
      >
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
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm text-slate-700">
          {loading ? (
            <p className="text-slate-500">Wczytywanie…</p>
          ) : detail && pr ? (
            <div className="space-y-4">
              <div className="flex gap-3">
                <PurchasingProductThumbnail
                  size="lg"
                  imageUrl={pr.image_url}
                  name={pr.name}
                  sku={pr.sku}
                  stock={detail.stock}
                  incomingQty={incomingQty}
                  unit={u}
                  hoverPreview={false}
                />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{pr.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    SKU: {pr.sku ?? "—"}
                    <br />
                    EAN: {pr.ean ?? "—"}
                  </p>
                  <Link
                    to={`/products/${pr.id}`}
                    className="mt-2 inline-block text-xs font-medium text-blue-600 hover:underline"
                  >
                    Karta produktu →
                  </Link>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
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
      </aside>
    </div>
  );
}

export const PurchasingProductInspectorDrawer = memo(PurchasingProductInspectorDrawerInner);
