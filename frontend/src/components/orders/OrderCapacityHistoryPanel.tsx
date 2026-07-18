import { useEffect, useState } from "react";

import {
  fetchOrderCapacityHistory,
  type OrderCapacityHistoryItem,
} from "../../api/capacityAnalyticsApi";

type OrderCapacityHistoryPanelProps = {
  orderId: number | null | undefined;
  className?: string;
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Capacity Engine attempts for one order — shown in order history / logs tab.
 * Separate from Activity Log.
 */
export default function OrderCapacityHistoryPanel({
  orderId,
  className = "",
}: OrderCapacityHistoryPanelProps) {
  const [items, setItems] = useState<OrderCapacityHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = orderId != null && Number(orderId) > 0;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOrderCapacityHistory(Number(orderId))
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setError(null); // soft-fail — section simply empty
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, orderId]);

  if (!ready) return null;
  if (!loading && !error && items.length === 0) return null;

  return (
    <section className={`mt-6 border-t border-slate-100 pt-4 ${className}`} aria-label="Capacity">
      <h3 className="mb-3 text-[11px] font-black uppercase tracking-wide text-slate-500">
        Capacity Engine
      </h3>
      {loading ? <p className="text-sm text-slate-400">Ładowanie…</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <ol className="space-y-3">
        {items.map((it) => {
          const assigned = it.result === "assigned";
          return (
            <li
              key={it.id}
              className="rounded-lg border border-slate-100 bg-white px-3 py-2.5 text-sm text-slate-800"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-bold tabular-nums text-slate-900">
                  {formatTime(it.occurred_at)}
                </span>
                <span className="font-semibold">
                  {assigned ? "Przypisano do wózka" : "Próba przypisania do wózka"}
                </span>
              </div>
              <dl className="mt-1.5 space-y-0.5 text-[13px] text-slate-600">
                <div>
                  <span className="font-semibold text-slate-500">Wózek: </span>
                  {it.cart_label || `#${it.cart_id}`}
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Wynik: </span>
                  {assigned ? "Przypisano" : "Nie przypisano"}
                </div>
                {!assigned && it.reason_label ? (
                  <div>
                    <span className="font-semibold text-slate-500">Powód: </span>
                    {it.reason_label}
                  </div>
                ) : null}
              </dl>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
