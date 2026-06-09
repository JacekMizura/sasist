import { useEffect, useState } from "react";
import { ExternalLink, Package, X } from "lucide-react";
import { Link } from "react-router-dom";

import api from "../../../api/axios";

type ProductInOrder = {
  id: number;
  name?: string | null;
  ean?: string | null;
  symbol?: string | null;
  image_url?: string | null;
};

type OrderItemRead = {
  id: number;
  quantity: number;
  product: ProductInOrder;
};

type OrderRead = {
  id: number;
  number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  status?: string | null;
  items: OrderItemRead[];
};

type OrderProductPreviewModalProps = {
  open: boolean;
  orderId: number | null;
  basketCode?: string | null;
  onClose: () => void;
};

function firstImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return url.split(";")[0]?.trim() || null;
}

function customerName(order: OrderRead | null): string {
  if (!order) return "";
  return [order.first_name, order.last_name]
    .map((x) => (x != null ? String(x).trim() : ""))
    .filter(Boolean)
    .join(" ");
}

export default function OrderProductPreviewModal({
  open,
  orderId,
  basketCode = null,
  onClose,
}: OrderProductPreviewModalProps) {
  const [order, setOrder] = useState<OrderRead | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !orderId) {
      setOrder(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<OrderRead>(`/orders/${orderId}/`)
      .then((res) => {
        if (!cancelled) setOrder(res.data);
      })
      .catch(() => {
        if (!cancelled) setOrder(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  if (!open) return null;

  const orderNum = (order?.number && String(order.number).trim()) || String(orderId ?? "");
  const cust = customerName(order);
  const slot = (basketCode ?? "").trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-preview-title"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Podgląd zamówienia</p>
              <h2 id="order-preview-title" className="mt-1 text-lg font-bold text-slate-900">
                Zamówienie #{orderNum}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {slot ? (
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-700">
                    Sekcja {slot}
                  </span>
                ) : null}
                {order?.status ? (
                  <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-medium text-blue-900">
                    {order.status}
                  </span>
                ) : null}
                {cust ? <span className="text-slate-600">{cust}</span> : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Zamknij"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {orderId ? (
            <Link
              to={`/orders/${orderId}`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-800 hover:underline"
              onClick={onClose}
            >
              Otwórz kartę zamówienia
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-12 text-sm text-slate-500">Ładowanie pozycji…</div>
          ) : order?.items?.length ? (
            <ul className="divide-y divide-slate-100">
              {order.items.map((item) => {
                const imgUrl = firstImageUrl(item.product?.image_url);
                const sku = item.product?.ean || item.product?.symbol || "—";
                const productId = item.product?.id;
                return (
                  <li key={item.id} className="flex gap-4 py-4 first:pt-0">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {imgUrl ? (
                        <img src={imgUrl} alt="" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <Package className="h-6 w-6 text-slate-300" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {productId ? (
                        <Link
                          to={`/products/${productId}/edit`}
                          className="font-semibold text-slate-900 hover:underline"
                          onClick={onClose}
                        >
                          {item.product?.name || "—"}
                        </Link>
                      ) : (
                        <div className="font-semibold text-slate-900">{item.product?.name || "—"}</div>
                      )}
                      <p className="mt-0.5 font-mono text-xs text-slate-500">SKU: {sku}</p>
                      <p className="mt-2 text-sm text-slate-700">
                        Ilość przypisana:{" "}
                        <span className="font-bold tabular-nums text-slate-900">{item.quantity}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">Brak pozycji w zamówieniu.</p>
          )}
        </div>
      </div>
    </div>
  );
}
