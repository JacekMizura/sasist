import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { fetchActivityLog } from "../../api/activityLogApi";
import type { ActivityEventItem, ActivityObjectType } from "../../types/activityLog";

type ActivityLogPanelProps = {
  objectType: ActivityObjectType | string;
  objectId: number | null | undefined;
  title?: string;
  defaultCollapsed?: boolean;
  refreshKey?: number;
  className?: string;
};

/**
 * Shared Activity Log — answers only: When? Who? What?
 *
 *   DATA I GODZINA
 *   Operator
 *
 *   Akcja.
 *
 *   #zamówienia (opcjonalnie)
 *
 * Backend stores ready Polish text; FE only renders.
 */
function ActivityEntry({ item }: { item: ActivityEventItem }) {
  const when = item.occurred_at_display || "—";
  const operator = item.operator_display || item.actor_name || "System";
  const action = (item.action || item.description || "").trim() || "Zdarzenie.";
  const orderNums = Array.isArray(item.order_numbers) ? item.order_numbers : [];

  return (
    <li className="border-b border-slate-200 py-4 last:border-b-0">
      <p className="text-sm font-semibold tabular-nums text-slate-900">{when}</p>
      <p className="mt-0.5 text-sm text-slate-700">{operator}</p>
      <p className="mt-3 text-sm leading-snug text-slate-900">{action}</p>
      {orderNums.length > 0 ? (
        <p className="mt-2 text-sm tabular-nums leading-relaxed text-slate-600">
          {orderNums.join(", ")}
        </p>
      ) : null}
    </li>
  );
}

export default function ActivityLogPanel({
  objectType,
  objectId,
  title = "Activity Log",
  defaultCollapsed = true,
  refreshKey = 0,
  className = "",
}: ActivityLogPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ActivityEventItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ready = objectId != null && Number(objectId) > 0;

  useEffect(() => {
    if (!ready || collapsed) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchActivityLog({ objectType, objectId: Number(objectId), limit: 100 })
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setError("Nie udało się wczytać historii czynności.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, collapsed, objectType, objectId, refreshKey]);

  const countLabel = useMemo(() => {
    if (collapsed || loading) return null;
    return items.length ? `${items.length}` : "0";
  }, [collapsed, loading, items.length]);

  if (!ready) return null;

  return (
    <section className={`mt-8 border-t border-slate-100 pt-4 ${className}`} aria-label={title}>
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
        )}
        <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">{title}</span>
        {countLabel != null ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            {countLabel}
          </span>
        ) : null}
      </button>

      {!collapsed ? (
        <div className="mt-2">
          {loading ? (
            <p className="text-sm text-slate-400">Ładowanie historii…</p>
          ) : error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-400">Brak zapisanych czynności dla tego obiektu.</p>
          ) : (
            <ol>
              {items.map((item) => (
                <ActivityEntry key={`${item.source_module || "act"}-${item.id}`} item={item} />
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}
