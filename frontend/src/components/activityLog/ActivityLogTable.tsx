import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, Filter, Search } from "lucide-react";

import { fetchActivityLog } from "../../api/activityLogApi";
import type { ActivityEventItem, ActivityObjectType } from "../../types/activityLog";
import { resolveEventDisplayLabel } from "../../utils/eventDisplayLabels";
import { erpProductionPaths } from "../../pages/Production/productionPaths";
import {
  ActivityLogOperatorCell,
  ActivityLogPaginationBar,
  ActivityLogStatusBadge,
  normalizeActivitySeverity,
  type ActivityLogPageSize,
} from "./activityLogTableUi";
import { ActivityLogAutomationExpand } from "./ActivityLogAutomationExpand";

export type ActivityLogTableRow = {
  id: string | number;
  date: string;
  operator: string;
  /** Event label / short title (ZDARZENIE). */
  event: string;
  /** Full message body (KOMUNIKAT / EFEKT). */
  message: string;
  entity_type?: string;
  entity_id?: number;
  severity?: string;
  /** ISO timestamp for reliable sorting. */
  occurredAt?: string | null;
  /** Optional link to MO/BAT detail when event is production-related. */
  productionHref?: string | null;
  productionLabel?: string | null;
  eventCode?: string;
  actorKind?: string | null;
  automationExecutionId?: number | null;
  metadata?: Record<string, unknown>;
  details?: { label: string; value: string }[];
  detailsDisplay?: "inline" | "expand" | "none";
};

type ActivityLogTableProps = {
  objectType?: ActivityObjectType | string;
  objectId?: number | null;
  rows?: ActivityLogTableRow[];
  title?: string;
  defaultCollapsed?: boolean;
  refreshKey?: number;
  className?: string;
  searchable?: boolean;
  /** Required for automation expand API (tenant-scoped). */
  tenantId?: number | null;
};

type SortDir = "newest" | "oldest";

function mapApiItem(item: ActivityEventItem): ActivityLogTableRow {
  const when = item.occurred_at_display || "—";
  const operator = (item.operator_display || item.actor_name || "System").trim() || "System";
  const event = resolveEventDisplayLabel({
    eventCode: item.event_code,
    eventDisplayLabel: item.event_display_label,
    fallbackDescription: item.action || item.description,
  });
  const message = (item.action || item.description || "").trim() || "—";
  const meta = item.metadata || {};
  const prodLink = (item.links || []).find((l) => String(l.object_type) === "production");
  const moNumber = String(meta.mo_number || meta.production_number || "").trim();
  const batNumber = String(meta.production_batch_number || "").trim();
  let productionHref: string | null = null;
  let productionLabel: string | null = null;
  if (prodLink && Number(prodLink.object_id) > 0) {
    productionLabel = (prodLink.object_label || moNumber || batNumber || "").trim() || null;
    if (batNumber || String(productionLabel || "").startsWith("BAT")) {
      productionHref = erpProductionPaths.batch(prodLink.object_id);
    } else {
      productionHref = erpProductionPaths.order(prodLink.object_id);
    }
  }
  const execRaw = meta.automation_execution_id ?? meta.ref_id;
  const automationExecutionId =
    String(meta.ref_type || "") === "automation_execution" && execRaw != null && Number(execRaw) > 0
      ? Number(execRaw)
      : meta.automation_execution_id != null && Number(meta.automation_execution_id) > 0
        ? Number(meta.automation_execution_id)
        : null;
  return {
    id: `${item.source_module || "act"}-${item.id}`,
    date: when,
    operator,
    event,
    message,
    severity: item.severity,
    occurredAt: item.occurred_at,
    productionHref,
    productionLabel,
    eventCode: item.event_code,
    actorKind: typeof meta.actor_kind === "string" ? meta.actor_kind : null,
    automationExecutionId,
    metadata: meta,
    details: Array.isArray(item.details)
      ? item.details
          .filter((d) => d && typeof d.label === "string" && typeof d.value === "string")
          .map((d) => ({ label: d.label, value: d.value }))
      : undefined,
    detailsDisplay:
      item.details_display === "inline" || item.details_display === "expand" || item.details_display === "none"
        ? item.details_display
        : Array.isArray(item.details) && item.details.length > 0
          ? "expand"
          : "none",
  };
}

/**
 * Shared ERP-style Activity Log table (journal mockup).
 * Columns: Czas i status | Wykonawca | Zdarzenie | Efekt / komunikat.
 */
export default function ActivityLogTable({
  objectType,
  objectId,
  rows: externalRows,
  title = "Historia czynności",
  defaultCollapsed = false,
  refreshKey = 0,
  className = "",
  searchable = true,
  tenantId = null,
}: ActivityLogTableProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed, objectType, objectId]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ActivityLogTableRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ActivityLogPageSize>(50);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [appliedSeverity, setAppliedSeverity] = useState("");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});

  const fetchReady =
    externalRows == null && objectType != null && objectId != null && Number(objectId) > 0;

  useEffect(() => {
    if (!fetchReady || collapsed) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchActivityLog({
      objectType: objectType!,
      objectId: Number(objectId),
      limit: 500,
      severity: appliedSeverity || undefined,
      dateFrom: appliedDateFrom || undefined,
      dateTo: appliedDateTo || undefined,
    })
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
  }, [
    fetchReady,
    collapsed,
    objectType,
    objectId,
    refreshKey,
    appliedSeverity,
    appliedDateFrom,
    appliedDateTo,
  ]);

  const sourceRows = externalRows ?? items;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = sourceRows;
    if (q) {
      rows = rows.filter(
        (r) =>
          r.message.toLowerCase().includes(q) ||
          r.event.toLowerCase().includes(q) ||
          r.operator.toLowerCase().includes(q) ||
          r.date.toLowerCase().includes(q),
      );
    }
    if (externalRows != null && appliedSeverity) {
      const want = appliedSeverity.toUpperCase();
      rows = rows.filter((r) => (r.severity ?? "").toUpperCase() === want);
    }
    const sorted = [...rows].sort((a, b) => {
      const ta = a.occurredAt ? Date.parse(a.occurredAt) : NaN;
      const tb = b.occurredAt ? Date.parse(b.occurredAt) : NaN;
      const aOk = Number.isFinite(ta);
      const bOk = Number.isFinite(tb);
      let cmp = 0;
      if (aOk && bOk) cmp = ta - tb;
      else cmp = String(a.date).localeCompare(String(b.date), "pl");
      return sortDir === "newest" ? -cmp : cmp;
    });
    return sorted;
  }, [sourceRows, query, sortDir, externalRows, appliedSeverity]);

  useEffect(() => {
    setPage(1);
  }, [query, sortDir, pageSize, appliedSeverity, appliedDateFrom, appliedDateTo, filtered.length]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const applyFilters = () => {
    setAppliedSeverity(severityFilter.trim());
    setAppliedDateFrom(dateFrom.trim());
    setAppliedDateTo(dateTo.trim());
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setSeverityFilter("");
    setDateFrom("");
    setDateTo("");
    setAppliedSeverity("");
    setAppliedDateFrom("");
    setAppliedDateTo("");
  };

  const filtersActive = Boolean(appliedSeverity || appliedDateFrom || appliedDateTo);

  if (!fetchReady && externalRows == null) return null;

  const thClass =
    "whitespace-nowrap px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400";
  const tdClass = "px-3 py-2 align-top";

  return (
    <section className={className} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="flex items-center gap-1.5 text-left"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          )}
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            {title}
            {!collapsed && !loading ? (
              <span className="font-semibold text-slate-400"> ({filtered.length})</span>
            ) : null}
          </span>
        </button>

        {!collapsed && searchable ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Szukaj w logach..."
                className="w-52 rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-slate-400"
              />
            </label>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-semibold shadow-sm transition-colors ${
                filtersOpen || filtersActive
                  ? "border-slate-300 bg-slate-100 text-slate-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              aria-expanded={filtersOpen}
            >
              <Filter className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Filtruj
            </button>
          </div>
        ) : null}
      </div>

      {!collapsed && filtersOpen ? (
        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2.5">
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="min-w-[9rem] flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Severity
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-800 outline-none"
              >
                <option value="">Wszystkie</option>
                <option value="SUCCESS">Wykonano (SUCCESS)</option>
                <option value="ERROR">Błąd (ERROR)</option>
                <option value="WARNING">Ostrzeżenie (WARNING)</option>
                <option value="INFO">Informacja (INFO)</option>
                <option value="AUDIT">Audit</option>
              </select>
            </label>
            <label className="min-w-[8rem] text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Od
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none"
              />
            </label>
            <label className="min-w-[8rem] text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Do
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none"
              />
            </label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={applyFilters}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-900"
              >
                Zastosuj
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Wyczyść
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!collapsed ? (
        <div className="mt-2.5 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
              <span>Sortuj:</span>
              <button
                type="button"
                onClick={() => setSortDir("newest")}
                className={
                  sortDir === "newest"
                    ? "font-bold text-slate-900"
                    : "font-medium text-slate-500 hover:text-slate-800"
                }
              >
                {sortDir === "newest" ? "✓ " : ""}
                Od najnowszych
              </button>
              <button
                type="button"
                onClick={() => setSortDir("oldest")}
                className={
                  sortDir === "oldest"
                    ? "font-bold text-slate-900"
                    : "font-medium text-slate-500 hover:text-slate-800"
                }
              >
                {sortDir === "oldest" ? "✓ " : ""}
                Od najstarszych
              </button>
            </div>
            <ActivityLogPaginationBar
              page={safePage}
              pageCount={pageCount}
              pageSize={pageSize}
              total={filtered.length}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          </div>

          {loading ? (
            <p className="px-3 py-5 text-sm text-slate-400">Ładowanie historii…</p>
          ) : error ? (
            <p className="px-3 py-5 text-sm text-rose-600">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-5 text-sm text-slate-400">Brak zapisanych czynności.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={thClass}>Czas i status</th>
                    <th className={thClass}>Wykonawca</th>
                    <th className={thClass}>Zdarzenie</th>
                    <th className={thClass}>Efekt / komunikat</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const tone = normalizeActivitySeverity(row.severity);
                    const isError = tone === "error";
                    const isWarn = tone === "warning";
                    const msg = (row.message || "").trim();
                    const eventTitle = (row.event || "").trim() || "—";
                    const hasMessage =
                      Boolean(msg) && msg !== "—" && msg.toLowerCase() !== eventTitle.toLowerCase();
                    // Effect column carries the business body (incl. multiline picking-entry details).
                    const effectNode: ReactNode = !hasMessage ? (
                      <span className="text-slate-400">—</span>
                    ) : isError || isWarn ? (
                      <span
                        className={`inline-flex items-start gap-1.5 text-[13px] font-semibold leading-snug ${
                          isError ? "text-red-700" : "text-amber-800"
                        }`}
                      >
                        <AlertTriangle
                          className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isError ? "text-red-600" : "text-amber-600"}`}
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span className="whitespace-pre-line">{msg}</span>
                      </span>
                    ) : (
                      <span className="whitespace-pre-line text-[13px] leading-snug text-slate-700">
                        {msg}
                      </span>
                    );
                    const productionLinkNode =
                      row.productionHref && row.productionLabel ? (
                        <div className="mt-1">
                          <Link
                            to={row.productionHref}
                            className="text-[12px] font-semibold text-sky-700 hover:underline"
                          >
                            {row.productionLabel}
                          </Link>
                        </div>
                      ) : null;

                    const hasDetails = Array.isArray(row.details) && row.details.length > 0;
                    const rowKey = String(row.id);
                    const detailsMode = row.detailsDisplay || (hasDetails ? "expand" : "none");
                    const detailsOpen = Boolean(expandedRowIds[rowKey]);
                    const showInlineDetails = hasDetails && detailsMode === "inline";
                    const showExpandDetails = hasDetails && detailsMode === "expand";

                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-slate-100 last:border-b-0 ${
                          isError
                            ? "bg-red-50/40"
                            : isWarn
                              ? "bg-amber-50/30"
                              : "bg-white hover:bg-slate-50/60"
                        }`}
                      >
                        <td className={`${tdClass} w-[9.5rem]`}>
                          <p className="whitespace-nowrap text-[13px] font-medium tabular-nums text-slate-800">
                            {row.date}
                          </p>
                          <ActivityLogStatusBadge severity={row.severity} />
                        </td>
                        <td className={`${tdClass} w-[11rem]`}>
                          <ActivityLogOperatorCell name={row.operator} actorKind={row.actorKind} />
                        </td>
                        <td className={tdClass}>
                          <p className="text-[13px] font-semibold leading-snug text-slate-900">{eventTitle}</p>
                        </td>
                        <td className={tdClass}>
                          {effectNode}
                          {productionLinkNode}
                          {showInlineDetails ? (
                            <dl className="mt-1.5 space-y-0.5">
                              {row.details!.map((d) => (
                                <div
                                  key={`${rowKey}-${d.label}-${d.value}`}
                                  className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-x-2 text-[12px] leading-snug"
                                >
                                  <dt className="truncate text-slate-500">{d.label}</dt>
                                  <dd className="min-w-0 break-words font-medium text-slate-800">{d.value}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : null}
                          {showExpandDetails ? (
                            <div className="mt-1.5">
                              <button
                                type="button"
                                className="text-[12px] font-semibold text-slate-600 hover:text-slate-900"
                                onClick={() =>
                                  setExpandedRowIds((prev) => ({
                                    ...prev,
                                    [rowKey]: !prev[rowKey],
                                  }))
                                }
                                aria-expanded={detailsOpen}
                              >
                                {detailsOpen ? "Ukryj szczegóły" : "Pokaż szczegóły"}
                              </button>
                              {detailsOpen ? (
                                <dl className="mt-1.5 space-y-1 rounded-md border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                                  {row.details!.map((d) => (
                                    <div key={`${rowKey}-${d.label}`} className="text-[12px] leading-snug">
                                      <dt className="font-semibold text-slate-500">{d.label}</dt>
                                      <dd className="text-slate-800">{d.value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              ) : null}
                            </div>
                          ) : null}
                          {row.automationExecutionId != null &&
                          tenantId != null &&
                          Number(tenantId) > 0 ? (
                            <ActivityLogAutomationExpand
                              executionId={row.automationExecutionId}
                              tenantId={Number(tenantId)}
                            />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filtered.length > 0 ? (
            <div className="border-t border-slate-100">
              <ActivityLogPaginationBar
                page={safePage}
                pageCount={pageCount}
                pageSize={pageSize}
                total={filtered.length}
                onPage={setPage}
                onPageSize={setPageSize}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
