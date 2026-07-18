import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

import { fetchActivityLog } from "../../api/activityLogApi";
import type { ActivityEventItem, ActivityObjectType } from "../../types/activityLog";

export type ActivityLogTableRow = {
  id: string | number;
  date: string;
  operator: string;
  action: string;
  entity_type?: string;
  entity_id?: number;
  severity?: string;
};

type ActivityLogTableProps = {
  /** Fetch from shared Activity Log API when objectType + objectId set. */
  objectType?: ActivityObjectType | string;
  objectId?: number | null;
  /** Or pass ready rows (date / operator / action). */
  rows?: ActivityLogTableRow[];
  title?: string;
  defaultCollapsed?: boolean;
  refreshKey?: number;
  className?: string;
  /** Show search box (filters action + operator client-side). */
  searchable?: boolean;
};

function mapApiItem(item: ActivityEventItem): ActivityLogTableRow {
  const when = item.occurred_at_display || "—";
  const operator = item.operator_display || item.actor_name || "System";
  const base = (item.action || item.description || "").trim() || "Zdarzenie.";
  const nums = Array.isArray(item.order_numbers) ? item.order_numbers : [];
  const action =
    nums.length > 0
      ? `${base.replace(/:\s*$/, "")}: ${nums.join(", ")}`
      : base.replace(/:\s*$/, "").replace(/\.\s*$/, "") || base;
  return {
    id: `${item.source_module || "act"}-${item.id}`,
    date: when,
    operator,
    action,
    severity: item.severity,
  };
}

function OperatorCell({ name }: { name: string }) {
  const isSystem = name.trim().toLowerCase() === "system";
  return (
    <span
      className={
        isSystem
          ? "inline-flex rounded-md bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800"
          : "inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900"
      }
    >
      {name}
    </span>
  );
}

/**
 * Shared ERP-style Activity Log table for the whole Sasist panel.
 * Displays only: Data | Operator | Akcja.
 */
export default function ActivityLogTable({
  objectType,
  objectId,
  rows: externalRows,
  title = "Historia czynności",
  defaultCollapsed = true,
  refreshKey = 0,
  className = "",
  searchable = true,
}: ActivityLogTableProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ActivityLogTableRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const fetchReady =
    externalRows == null && objectType != null && objectId != null && Number(objectId) > 0;

  useEffect(() => {
    if (!fetchReady || collapsed) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchActivityLog({ objectType: objectType!, objectId: Number(objectId), limit: 100 })
      .then((res) => {
        if (!cancelled) setItems(res.items.map(mapApiItem));
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
  }, [fetchReady, collapsed, objectType, objectId, refreshKey]);

  const sourceRows = externalRows ?? items;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sourceRows;
    return sourceRows.filter(
      (r) =>
        r.action.toLowerCase().includes(q) ||
        r.operator.toLowerCase().includes(q) ||
        r.date.toLowerCase().includes(q),
    );
  }, [sourceRows, query]);

  if (!fetchReady && externalRows == null) return null;

  return (
    <section className={`${className}`} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
          )}
          <span className="text-sm font-semibold text-slate-800">{title}</span>
          {!collapsed && !loading ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {filtered.length}
            </span>
          ) : null}
        </button>
        {!collapsed && searchable ? (
          <div className="flex items-center gap-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Szukaj…"
                className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </label>
          </div>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <p className="px-4 py-6 text-sm text-slate-400">Ładowanie historii…</p>
          ) : error ? (
            <p className="px-4 py-6 text-sm text-rose-600">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">Brak zapisanych czynności.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2.5 font-bold">Data</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-bold">Operator</th>
                    <th className="px-4 py-2.5 font-bold">Akcja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">
                        {row.date}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <OperatorCell name={row.operator} />
                      </td>
                      <td className="px-4 py-3 leading-snug text-slate-800">{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && filtered.length > 0 ? (
            <div className="border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">
              Pokazano {filtered.length}{" "}
              {filtered.length === 1 ? "wpis" : filtered.length < 5 ? "wpisy" : "wpisów"}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
