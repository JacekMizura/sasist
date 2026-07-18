import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

const ORDER_NUMBERS_PREVIEW = 15;

function OrderNumbersBlock({ numbers }: { numbers: string[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!numbers.length) return null;
  const truncated = !showAll && numbers.length > ORDER_NUMBERS_PREVIEW;
  const visible = truncated ? numbers.slice(0, ORDER_NUMBERS_PREVIEW) : numbers;
  return (
    <div className="text-[13px] text-slate-700">
      <span className="font-semibold text-slate-600">Zamówienia: </span>
      <span className="tabular-nums">{visible.join(", ")}</span>
      {truncated ? (
        <>
          <span className="text-slate-400"> …</span>
          <button
            type="button"
            className="ml-1.5 font-semibold text-sky-700 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(true);
            }}
          >
            Pokaż wszystkie
          </button>
        </>
      ) : null}
      {showAll && numbers.length > ORDER_NUMBERS_PREVIEW ? (
        <button
          type="button"
          className="ml-1.5 font-semibold text-slate-500 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setShowAll(false);
          }}
        >
          Zwiń
        </button>
      ) : null}
    </div>
  );
}

function ActivityEntry({
  item,
  hideObjectType,
}: {
  item: ActivityEventItem;
  hideObjectType: string;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const when = item.occurred_at_display || "—";
  const operator = item.operator_display || item.actor_name || "System";
  const action = (item.action || item.description || "").trim() || "Zdarzenie.";
  const details = Array.isArray(item.details) ? item.details : [];
  const orderNums = Array.isArray(item.order_numbers) ? item.order_numbers : [];
  const related = (item.links || []).filter((l) => l.object_type !== hideObjectType);

  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        className="w-full py-3 text-left transition hover:bg-slate-50/70"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-semibold tabular-nums text-slate-900">{when}</p>
            <p className="text-sm font-medium text-slate-700">{operator}</p>
            <p className="text-sm leading-snug text-slate-800">{action}</p>
          </div>
          {open ? (
            <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          ) : (
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          )}
        </div>
      </button>

      {open ? (
        <div className="mb-3 space-y-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
          {details.length ? (
            <dl className="space-y-1.5 text-[13px]">
              {details.map((row) => (
                <div key={`${row.label}-${row.value.slice(0, 24)}`} className="flex flex-wrap gap-x-2">
                  <dt className="font-semibold text-slate-600">{row.label}</dt>
                  <dd className="text-slate-800">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {orderNums.length > ORDER_NUMBERS_PREVIEW ? (
            <OrderNumbersBlock numbers={orderNums} />
          ) : null}
          {related.length ? (
            <div className="flex flex-wrap gap-2 border-t border-slate-50 pt-2">
              {related.map((lnk) => {
                const label = lnk.object_label || `${lnk.object_type} #${lnk.object_id}`;
                return (
                  <button
                    key={`${lnk.object_type}-${lnk.object_id}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (lnk.href) navigate(lnk.href);
                    }}
                    disabled={!lnk.href}
                    className="rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-default disabled:opacity-60"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Shared Activity Log for all Sasist panel objects.
 * Layout (identical everywhere): DATA → OPERATOR → AKCJA + expandable details.
 * Renders only ready fields from the API — no code translation on the client.
 */
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
        <div className="mt-3">
          {loading ? (
            <p className="text-sm text-slate-400">Ładowanie historii…</p>
          ) : error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-400">Brak zapisanych czynności dla tego obiektu.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {items.map((item) => (
                <ActivityEntry
                  key={`${item.source_module || "act"}-${item.id}`}
                  item={item}
                  hideObjectType={String(objectType)}
                />
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}
