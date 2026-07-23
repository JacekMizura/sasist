import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Unlink } from "lucide-react";

import api from "../../../api/axios";
import {
  AssignedOrderHoverAnchor,
  AssignedOrderProductsPreview,
  type AssignedOrderProductPreview,
} from "./AssignedOrderProductsPreview";

export type AssignedOrderProduct = AssignedOrderProductPreview;

export type AssignedOrderRow = {
  order_id: number;
  number?: string | null;
  status?: string | null;
  customer_name?: string | null;
  items_count?: number | null;
  total_volume_dm3?: number | null;
  total_weight_kg?: number | null;
  products?: AssignedOrderProduct[] | null;
  can_detach?: boolean;
  detach_block_reason?: string | null;
  /** Projection only — sum of declared line shortages */
  picking_shortage_qty?: number | null;
  picking_status?: "INCOMPLETE" | "READY" | "IN_PROGRESS" | string | null;
  picking_status_label?: string | null;
};

type AssignedOrdersSectionProps = {
  orders: AssignedOrderRow[];
  cartId: number | null;
  onDetachSuccess?: () => void;
};

function buyerLabel(o: AssignedOrderRow): string {
  const name = (o.customer_name || "").trim();
  return name && name !== "—" ? name : "—";
}

function OrderNumberPreview({ o, label }: { o: AssignedOrderRow; label: string }) {
  const products = Array.isArray(o.products) ? o.products : [];
  const buyer = buyerLabel(o);
  return (
    <AssignedOrderProductsPreview
      variant="summary"
      products={products}
      header={
        <div className="border-b border-slate-100 pb-2">
          <p className="text-sm font-bold text-slate-900">Zamówienie {label}</p>
          {buyer !== "—" ? (
            <p className="mt-0.5 text-[13px] font-medium text-slate-700">{buyer}</p>
          ) : null}
        </div>
      }
    />
  );
}

function statusBadge(o: AssignedOrderRow) {
  const shortage = Number(o.picking_shortage_qty ?? 0);
  if (shortage > 1e-9 || o.picking_status === "INCOMPLETE") {
    const qtyLabel = Number.isFinite(shortage) && shortage > 0 ? `BRAK ${shortage} SZT.` : "BRAK";
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="inline-flex rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-800">
          {qtyLabel}
        </span>
        <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
          {o.picking_status_label || "NIEKOMPLETNE"}
        </span>
      </span>
    );
  }
  if (o.picking_status === "IN_PROGRESS") {
    return (
      <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-indigo-800">
        {o.picking_status_label || "NIEROZLICZONE"}
      </span>
    );
  }
  if (o.picking_status === "READY") {
    return (
      <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
        {o.picking_status_label || "GOTOWE"}
      </span>
    );
  }
  const raw = (o.status || "—").trim();
  const upper = raw.toUpperCase();
  if (upper.includes("WMS") || upper.includes("PICK") || upper === "NEW") {
    return (
      <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
        {raw || "WMS"}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
      {raw}
    </span>
  );
}

/**
 * Assigned orders — ERP table with interactive hover previews (no modals).
 */
export function AssignedOrdersSection({
  orders,
  cartId,
  onDetachSuccess,
}: AssignedOrdersSectionProps) {
  const navigate = useNavigate();
  const [detachingId, setDetachingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDetach = async (o: AssignedOrderRow) => {
    if (cartId == null || !o.can_detach) return;
    setError(null);
    setDetachingId(o.order_id);
    try {
      await api.post(`/carts/${cartId}/orders/${o.order_id}/detach`);
      onDetachSuccess?.();
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Nie udało się odłączyć zamówienia.";
      setError(typeof detail === "string" ? detail : "Nie udało się odłączyć zamówienia.");
    } finally {
      setDetachingId(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">
          Przypisane zamówienia
          <span className="ml-2 font-medium text-slate-400">({orders.length})</span>
        </h3>
      </div>

      {error ? <p className="px-4 pt-3 text-sm text-rose-600">{error}</p> : null}

      {!orders.length ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Brak przypisanych zamówień.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Numer</th>
                <th className="px-4 py-2.5">Kupujący</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Pozycje</th>
                <th className="px-4 py-2.5 text-right">Objętość</th>
                <th className="px-4 py-2.5 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => {
                const label = o.number ? `#${String(o.number).replace(/^#/, "")}` : `#${o.order_id}`;
                const vol = Number(o.total_volume_dm3 ?? 0);
                const canDetach = Boolean(o.can_detach);
                const blockReason =
                  o.detach_block_reason ||
                  "Nie można odłączyć zamówienia, ponieważ rozpoczęto już jego kompletację.";
                const itemsLabel =
                  o.items_count != null
                    ? `${o.items_count} ${
                        o.items_count === 1 ? "pozycja" : o.items_count < 5 ? "pozycje" : "pozycji"
                      }`
                    : "—";
                const products = Array.isArray(o.products) ? o.products : [];
                return (
                  <tr key={o.order_id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-semibold">
                      <AssignedOrderHoverAnchor content={<OrderNumberPreview o={o} label={label} />}>
                        <button
                          type="button"
                          onClick={() => navigate(`/orders/${o.order_id}`)}
                          className="cursor-pointer text-sky-700 hover:underline"
                        >
                          {label}
                        </button>
                      </AssignedOrderHoverAnchor>
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-slate-700" title={buyerLabel(o)}>
                      {buyerLabel(o)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(o)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      <AssignedOrderHoverAnchor
                        content={
                          <AssignedOrderProductsPreview
                            variant="detail"
                            products={products}
                            interactiveProducts
                          />
                        }
                      >
                        <span className="cursor-help border-b border-dotted border-slate-300">
                          {itemsLabel}
                        </span>
                      </AssignedOrderHoverAnchor>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {vol > 0 ? `${vol.toFixed(1)} dm³` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/orders/${o.order_id}`)}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-sky-700 hover:underline"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden />
                          Otwórz
                        </button>
                        <button
                          type="button"
                          disabled={!canDetach || detachingId === o.order_id || cartId == null}
                          title={canDetach ? "Odłącz zamówienie" : blockReason}
                          onClick={() => void handleDetach(o)}
                          className={
                            canDetach
                              ? "inline-flex items-center gap-1 text-[12px] font-semibold text-amber-800 hover:underline disabled:opacity-50"
                              : "inline-flex items-center gap-1 text-[12px] font-semibold text-slate-400 disabled:cursor-not-allowed"
                          }
                        >
                          <Unlink className="h-3.5 w-3.5" aria-hidden />
                          {detachingId === o.order_id ? "…" : "Odłącz"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
