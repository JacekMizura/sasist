import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Unlink } from "lucide-react";

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

function formatOrderNumberTooltip(o: AssignedOrderRow, label: string): string {
  const products = Array.isArray(o.products) ? o.products : [];
  const lines = [
    `Numer: ${label}`,
    `Kupujący: ${o.customer_name?.trim() || "—"}`,
    `Produktów: ${o.items_count ?? products.length}`,
    "",
    "Produkty:",
  ];
  if (!products.length) {
    lines.push("—");
  } else {
    for (const p of products) {
      lines.push(`• ${p.name} × ${p.quantity}`);
    }
  }
  const vol = Number(o.total_volume_dm3 ?? 0);
  const weight = Number(o.total_weight_kg ?? 0);
  lines.push("");
  lines.push(`Objętość: ${vol > 0 ? `${vol.toFixed(1)} dm³` : "—"}`);
  lines.push(`Waga: ${weight > 0 ? `${weight.toFixed(2)} kg` : "—"}`);
  return lines.join("\n");
}

function formatProductsTooltip(o: AssignedOrderRow): string {
  const products = Array.isArray(o.products) ? o.products : [];
  if (!products.length) return "Brak pozycji.";
  return products
    .map((p) => {
      const codes = [p.ean ? `EAN ${p.ean}` : null, p.sku ? `SKU ${p.sku}` : null]
        .filter(Boolean)
        .join(" · ");
      return codes ? `• ${p.name} × ${p.quantity}\n  ${codes}` : `• ${p.name} × ${p.quantity}`;
    })
    .join("\n");
}

/**
 * Admin cart expand: concrete assigned orders (not just a count).
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

  if (!orders.length) {
    return (
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          Przypisane zamówienia
        </h3>
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          Brak przypisanych zamówień.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        Przypisane zamówienia
        <span className="ml-2 font-semibold normal-case tracking-normal text-slate-400">
          ({orders.length})
        </span>
      </h3>
      {error ? <p className="mb-2 text-sm text-rose-600">{error}</p> : null}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Numer</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Pozycje</th>
              <th className="px-3 py-2 text-right">Objętość</th>
              <th className="px-3 py-2 text-right">Akcje</th>
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
              return (
                <tr key={o.order_id} className="bg-white hover:bg-slate-50/80">
                  <td className="px-3 py-2 font-semibold text-slate-900">
                    <HoverPopover content={formatOrderNumberTooltip(o, label)}>
                      <span className="cursor-help border-b border-dotted border-slate-300">
                        {label}
                      </span>
                    </HoverPopover>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{o.status || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    <HoverPopover content={formatProductsTooltip(o)}>
                      <span className="cursor-help border-b border-dotted border-slate-300">
                        {o.items_count ?? "—"}
                      </span>
                    </HoverPopover>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {vol > 0 ? `${vol.toFixed(1)} dm³` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => navigate(`/orders/${o.order_id}`)}
                        className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
                        title="Otwórz zamówienie"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden />
                        Otwórz
                      </button>
                      <button
                        type="button"
                        disabled={!canDetach || detachingId === o.order_id || cartId == null}
                        title={canDetach ? "Odłącz zamówienie" : blockReason}
                        onClick={() => void handleDetach(o)}
                        className={
                          canDetach
                            ? "inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                            : "inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                        }
                      >
                        <Unlink className="h-3 w-3" aria-hidden />
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
    </div>
  );
}
