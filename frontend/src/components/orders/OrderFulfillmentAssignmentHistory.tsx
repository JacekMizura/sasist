import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  fetchOrderFulfillmentAssignmentAudits,
  type OrderFulfillmentAssignmentAudit,
} from "../../api/multiWarehouseUiApi";

type Props = {
  orderId: number;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function OrderFulfillmentAssignmentHistory({ orderId }: Props) {
  const [rows, setRows] = useState<OrderFulfillmentAssignmentAudit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchOrderFulfillmentAssignmentAudits(orderId)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <section className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h3 className="text-sm font-semibold text-slate-900">Historia magazynu realizacji</h3>
      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Wczytywanie…
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Brak wpisów audytu.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-semibold">Data</th>
                <th className="px-2 py-2 font-semibold">Magazyn</th>
                <th className="px-2 py-2 font-semibold">Strategia</th>
                <th className="px-2 py-2 font-semibold">Użytkownik</th>
                <th className="px-2 py-2 font-semibold">Powód</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-2 whitespace-nowrap tabular-nums text-slate-700">{fmtDate(r.created_at)}</td>
                  <td className="px-2 py-2 text-slate-900">{r.assigned_warehouse_name || `#${r.assigned_warehouse_id}`}</td>
                  <td className="px-2 py-2 font-mono text-xs text-slate-800">{r.strategy || "—"}</td>
                  <td className="px-2 py-2 text-slate-700">{r.assigned_by_label || "AUTO"}</td>
                  <td className="px-2 py-2 text-slate-600">{r.reason?.trim() || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
