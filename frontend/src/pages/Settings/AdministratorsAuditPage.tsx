import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Navigate, useLocation } from "react-router-dom";
import { ScrollText, X } from "lucide-react";

import { fetchAuditLogs, type AuditLogItem } from "../../api/authApi";
import {
  auditDetailLines,
  humanizeAuditAction,
  humanizeEntityType,
  humanizeModule,
} from "../../utils/workforceUiLabels";
import {
  listSellasistFilterGridClass4,
  listSellasistInputClass,
  listSellasistTableBodyCellGrid,
  listSellasistTableHeaderCellGrid,
} from "../../components/listPage/listSellasistTokens";
import { useAuth } from "../../context/AuthContext";

function detailSearchBlob(detail: Record<string, unknown> | null): string {
  return auditDetailLines(detail).join(" ");
}

export default function AdministratorsAuditPage() {
  const { user, loading: authLoading, hasPermission } = useAuth();
  const location = useLocation();
  const [rows, setRows] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [detailModal, setDetailModal] = useState<AuditLogItem | null>(null);

  useEffect(() => {
    if (!detailModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailModal]);

  useEffect(() => {
    if (!hasPermission("audit.view")) {
      setLoading(false);
      return;
    }
    void (async () => {
      setErr(null);
      setLoading(true);
      try {
        const data = await fetchAuditLogs({ limit: 200 });
        setRows(data);
      } catch {
        setErr("Brak dostępu do audytu lub błąd sieci (wymagane uprawnienie audit.view).");
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [hasPermission]);

  useEffect(() => {
    if (!hasPermission("audit.view")) return;
    const t = window.setInterval(() => {
      void fetchAuditLogs({ limit: 200 })
        .then(setRows)
        .catch(() => {});
    }, 30_000);
    return () => window.clearInterval(t);
  }, [hasPermission]);

  const userOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const label = r.login ?? (r.user_id != null ? `#${r.user_id}` : "");
      if (label) set.add(label);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pl"));
  }, [rows]);

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.action) set.add(r.action);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pl"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = rows;
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter((r) => {
        const hay = [
          r.action,
          r.login ?? "",
          r.module ?? "",
          humanizeEntityType(r.entity_type),
          detailSearchBlob(r.detail),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(s);
      });
    }
    if (userFilter.trim()) {
      list = list.filter((r) => {
        const label = r.login ?? (r.user_id != null ? `#${r.user_id}` : "");
        return label === userFilter;
      });
    }
    if (actionFilter.trim()) {
      list = list.filter((r) => r.action === actionFilter);
    }
    if (dateFrom.trim()) {
      const from = new Date(dateFrom);
      if (!Number.isNaN(from.getTime())) {
        list = list.filter((r) => new Date(r.created_at) >= from);
      }
    }
    if (dateTo.trim()) {
      const to = new Date(dateTo);
      if (!Number.isNaN(to.getTime())) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        list = list.filter((r) => new Date(r.created_at) <= end);
      }
    }
    return list;
  }, [rows, search, userFilter, actionFilter, dateFrom, dateTo]);

  if (!authLoading && !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!authLoading && user && !hasPermission("audit.view")) {
    return (
      <div className="px-1 pb-2 pt-1">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">Brak uprawnienia „Audyt — podgląd logów”.</p>
        </div>
      </div>
    );
  }

  const th = listSellasistTableHeaderCellGrid;
  const td = listSellasistTableBodyCellGrid;
  const theadCls = "sticky top-0 z-[20] bg-slate-50 shadow-[0_1px_0_0_rgb(226_232_240)]";

  const modal =
    detailModal && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[240] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
            onClick={() => setDetailModal(null)}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="audit-detail-title"
              className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 id="audit-detail-title" className="text-sm font-semibold text-slate-900">
                  Szczegóły zdarzenia #{detailModal.id}
                </h2>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Zamknij"
                  onClick={() => setDetailModal(null)}
                >
                  <X className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
              </div>
              <div className="max-h-[calc(85vh-60px)] overflow-auto bg-slate-50 p-4 text-left text-sm leading-relaxed text-slate-800">
                <p className="text-xs text-slate-500">{new Date(detailModal.created_at).toLocaleString()}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {detailModal.login ?? "—"} · {humanizeModule(detailModal.module)}
                </p>
                {humanizeEntityType(detailModal.entity_type) ? (
                  <p className="mt-2 text-sm text-slate-700">{humanizeEntityType(detailModal.entity_type)}</p>
                ) : null}
                <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-slate-800">
                  {auditDetailLines(detailModal.detail ?? null).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Filtry</p>
        <div className={listSellasistFilterGridClass4}>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">Szukaj</span>
            <input
              type="search"
              placeholder="Szukaj po opisie, osobie, obszarze…"
              className={listSellasistInputClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">Użytkownik</span>
            <select
              className={listSellasistInputClass}
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <option value="">Wszyscy</option>
              {userOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">Akcja</span>
            <select
              className={listSellasistInputClass}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">Wszystkie</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>
                  {humanizeAuditAction(a)}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">Data od</span>
            <input
              type="date"
              className={listSellasistInputClass}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">Data do</span>
            <input
              type="date"
              className={listSellasistInputClass}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
        </div>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : filteredRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
          <ScrollText className="h-10 w-10 text-slate-300" strokeWidth={1.5} aria-hidden />
          <p className="mt-4 text-base font-semibold text-slate-800">Brak wpisów</p>
          <p className="mt-1 max-w-md text-sm text-slate-600">
            Zmień filtry lub sprawdź ponownie po wykonaniu operacji w systemie.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[960px] border-collapse">
            <thead className={theadCls}>
              <tr>
                <th className={`${th} whitespace-nowrap text-left`}>Kiedy</th>
                <th className={`${th} text-left`}>Kto</th>
                <th className={`${th} text-left`}>Obszar</th>
                <th className={`${th} text-left`}>Co się stało</th>
                <th className={`${th} text-left`}>Powiązanie</th>
                <th className={`${th} text-left`}>Uwagi</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const lines = auditDetailLines(r.detail ?? null);
                const preview = lines[0] ?? "—";
                const truncated = preview.length > 120 ? `${preview.slice(0, 117)}…` : preview;
                return (
                  <tr key={r.id} className="transition-colors hover:bg-slate-50/90 [&>td]:align-middle">
                    <td className={`${td} whitespace-nowrap text-xs text-slate-600`}>
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className={`${td} text-sm text-slate-900`}>{r.login ?? "—"}</td>
                    <td className={`${td} text-sm text-slate-700`}>{humanizeModule(r.module)}</td>
                    <td className={`${td} text-sm font-medium leading-snug text-slate-900`}>{humanizeAuditAction(r.action)}</td>
                    <td className={`${td} text-sm text-slate-700`}>{humanizeEntityType(r.entity_type) || "—"}</td>
                    <td className={`${td} max-w-[320px]`}>
                      {lines.length > 0 ? (
                        <button
                          type="button"
                          className="inline-block max-w-full truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100"
                          title={lines.join(" · ")}
                          onClick={() => setDetailModal(r)}
                        >
                          {truncated}
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal}
    </div>
  );
}
