import { useEffect, useState } from "react";
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
  items: OrderItemRead[];
};

type OrderProductPreviewModalProps = {
  open: boolean;
  orderId: number | null;
  /** Kod slotu koszyka (np. z API `barcode` lub etykieta S-rząd-kolumna) — wyświetlany jako „Koszyk …”. */
  basketCode?: string | null;
  onClose: () => void;
};

function buildOrderPreviewTitle(
  order: OrderRead | null,
  orderId: number,
  basketCode: string | null | undefined,
): string {
  const num = (order?.number && String(order.number).trim()) || String(orderId);
  const parts: string[] = [`Zamówienie #${num}`];
  const slot = (basketCode ?? "").trim();
  if (slot) {
    parts.push(`Koszyk ${slot}`);
  }
  const cust = order
    ? [order.first_name, order.last_name]
        .map((x) => (x != null ? String(x).trim() : ""))
        .filter(Boolean)
        .join(" ")
        .trim()
    : "";
  if (cust) {
    parts.push(cust);
  }
  return parts.join(" • ");
}

/** First image URL from semicolon-separated list. */
function firstImageUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  const first = url.split(";")[0]?.trim();
  return first || null;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-800 text-sm sm:text-base leading-snug min-w-0">
            {buildOrderPreviewTitle(order, orderId ?? 0, basketCode)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Zamknij"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {loading ? (
            <div className="flex justify-center py-8 text-slate-400">Ładowanie…</div>
          ) : order?.items?.length ? (
            <ul className="space-y-3">
              {order.items.map((item) => {
                const imgUrl = firstImageUrl(item.product?.image_url);
                const sku = item.product?.ean || item.product?.symbol || "—";
                return (
                  <li
                    key={item.id}
                    className="flex gap-4 items-start p-3 rounded-lg border border-slate-200 bg-slate-50/50"
                  >
                    <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt=""
                          className="max-h-full max-w-full object-contain object-center"
                        />
                      ) : (
                        <span className="text-[10px] font-bold text-slate-300">OBR</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 truncate">
                        {item.product?.name || "—"}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">SKU: {sku}</div>
                      <div className="text-sm font-bold text-slate-700 mt-1">
                        Ilość: {item.quantity}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="py-8 text-center text-slate-500 text-sm">
              Brak pozycji w zamówieniu.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
