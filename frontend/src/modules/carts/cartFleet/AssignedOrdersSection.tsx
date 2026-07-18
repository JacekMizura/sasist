import { useNavigate } from "react-router-dom";
import { ExternalLink, Unlink } from "lucide-react";

export type AssignedOrderRow = {
  order_id: number;
  number?: string | null;
  status?: string | null;
  items_count?: number | null;
  total_volume_dm3?: number | null;
};

type AssignedOrdersSectionProps = {
  orders: AssignedOrderRow[];
  /** Reserved for future detach action — button disabled for now. */
  detachEnabled?: boolean;
};

/**
 * Admin cart expand: concrete assigned orders (not just a count).
 */
export function AssignedOrdersSection({ orders, detachEnabled = false }: AssignedOrdersSectionProps) {
  const navigate = useNavigate();

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
              return (
                <tr key={o.order_id} className="bg-white hover:bg-slate-50/80">
                  <td className="px-3 py-2 font-semibold text-slate-900">{label}</td>
                  <td className="px-3 py-2 text-slate-600">{o.status || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {o.items_count ?? "—"}
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
                        disabled={!detachEnabled}
                        title={
                          detachEnabled
                            ? "Odłącz zamówienie"
                            : "Odłącz — wkrótce"
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Unlink className="h-3 w-3" aria-hidden />
                        Odłącz
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
