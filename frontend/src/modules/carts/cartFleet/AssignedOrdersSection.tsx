import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Unlink } from "lucide-react";

import api from "../../../api/axios";
import { HoverPopover } from "../../../components/ui/HoverPopover";

export type AssignedOrderProduct = {
  name: string;
  quantity: number;
  sku?: string | null;
  ean?: string | null;
};

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
};

type AssignedOrdersSectionProps = {
  orders: AssignedOrderRow[];
  cartId: number | null;
  onDetachSuccess?: () => void;
};

function OrderNumberTooltip({ o, label }: { o: AssignedOrderRow; label: string }): ReactNode {
  const products = Array.isArray(o.products) ? o.products : [];
  const preview = products.slice(0, 5);
  const vol = Number(o.total_volume_dm3 ?? 0);
  const weight = Number(o.total_weight_kg ?? 0);
  return (
    <div className="space-y-1.5">
      <p className="font-semibold text-slate-900">{o.customer_name?.trim() || "—"}</p>
      <p className="text-slate-600">
        Produktów: <span className="font-semibold text-slate-800">{o.items_count ?? products.length}</span>
      </p>
      <ul className="space-y-0.5 text-slate-700">
        {preview.length ? (
          preview.map((p, i) => (
            <li key={`${p.name}-${i}`}>
              {p.name} × {p.quantity}
            </li>
          ))
        ) : (
          <li>—</li>
        )}
        {products.length > preview.length ? (
          <li className="text-slate-400">… +{products.length - preview.length}</li>
        ) : null}
      </ul>
      <p className="border-t border-slate-100 pt-1.5 text-slate-600">
        Objętość: {vol > 0 ? `${vol.toFixed(1)} dm³` : "—"}
        {" · "}
        Waga: {weight > 0 ? `${weight.toFixed(2)} kg` : "—"}
      </p>
      <p className="text-[10px] text-slate-400">{label}</p>
    </div>
  );
}

function ProductsTooltip({ o }: { o: AssignedOrderRow }): ReactNode {
  const products = Array.isArray(o.products) ? o.products : [];
  if (!products.length) return <p>Brak pozycji.</p>;
  return (
    <ul className="space-y-1.5">
      {products.map((p, i) => {
        const codes = [p.ean ? `EAN ${p.ean}` : null, p.sku ? `SKU ${p.sku}` : null]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={`${p.name}-${i}`}>
            <span className="font-medium text-slate-900">
              {p.name} × {p.quantity}
            </span>
            {codes ? <div className="text-[11px] text-slate-500">{codes}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

function statusBadge(status: string | null | undefined) {
  const raw = (status || "—").trim();
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
 * Assigned orders — ERP table with hover tooltips (no modals).
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
                return (
                  <tr key={o.order_id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-semibold">
                      <HoverPopover content={<OrderNumberTooltip o={o} label={label} />}>
                        <button
                          type="button"
                          onClick={() => navigate(`/orders/${o.order_id}`)}
                          className="cursor-pointer text-sky-700 hover:underline"
                        >
                          {label}
                        </button>
                      </HoverPopover>
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-slate-700">
                      {o.customer_name?.trim() || "—"}
                    </td>
                    <td className="px-4 py-3">{statusBadge(o.status)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      <HoverPopover content={<ProductsTooltip o={o} />}>
                        <span className="cursor-help border-b border-dotted border-slate-300">
                          {itemsLabel}
                        </span>
                      </HoverPopover>
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
