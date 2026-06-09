import { useEffect, useMemo, useState } from "react";

import { fetchUsers, type AppUserListItem } from "../../api/authApi";
import {
  fetchWorkforceActivityLogs,
  fetchWorkforceAnalytics,
  type WorkforceActivityRow,
  type WorkforceAnalyticsResponse,
} from "../../api/workforceApi";
import { isSuperRole } from "../../auth/isSuperRole";
import { useAuth } from "../../context/AuthContext";
import { humanizeActivityAction, humanizeModule } from "../../utils/workforceUiLabels";
import { WorkforceActivityTimeline, WorkforceSessionsTable } from "./WorkforceAnalyticsPanels";

const DEFAULT_TENANT = 1;

function rosterName(u: AppUserListItem): string {
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return n || u.login;
}

export default function WorkforceActivityPage() {
  const { user, hasPermission, sessionReady } = useAuth();
  const canView = hasPermission("workforce.activity.read") || isSuperRole(user?.role ?? "");
  const [rows, setRows] = useState<WorkforceActivityRow[]>([]);
  const [analytics, setAnalytics] = useState<WorkforceAnalyticsResponse | null>(null);
  const [users, setUsers] = useState<AppUserListItem[]>([]);
  const [filterUserId, setFilterUserId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = (userId?: number) => {
    const uid = userId ?? (filterUserId === "" ? undefined : filterUserId);
    return Promise.all([
      fetchWorkforceActivityLogs({ tenant_id: DEFAULT_TENANT, limit: 250, user_id: uid }),
      fetchWorkforceAnalytics({ tenant_id: DEFAULT_TENANT, user_id: uid }),
    ]).then(([logs, an]) => {
      setRows(logs);
      setAnalytics(an);
    });
  };

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void fetchUsers()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    load()
      .catch(() => {
        if (!cancelled) setErr("Nie udało się wczytać listy aktywności.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canView, sessionReady]);

  useEffect(() => {
    if (!canView) return;
    const t = window.setInterval(() => {
      void load().catch(() => {});
    }, 30_000);
    return () => window.clearInterval(t);
  }, [canView, filterUserId]);

  const userLabel = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of users) m.set(u.id, rosterName(u));
    return (id: number | null | undefined, login: string | null | undefined) => {
      if (id != null && m.has(id)) return m.get(id)!;
      return login?.trim() || "Pracownik";
    };
  }, [users]);

  if (!canView) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Brak uprawnienia do podglądu szczegółowej aktywności operatorów.
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Operator</span>
          <select
            className="min-w-[12rem] rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={filterUserId === "" ? "" : String(filterUserId)}
            onChange={(e) => {
              const v = e.target.value;
              const uid = v === "" ? "" : Number(v);
              setFilterUserId(uid);
              void load(uid === "" ? undefined : uid).catch(() => setErr("Nie udało się przefiltrować aktywności."));
            }}
          >
            <option value="">Wszyscy</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {rosterName(u)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-500">
          Telemetria z całego systemu · sesja kończy się po 15 min bez aktywności
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Ładowanie…</div>
      ) : null}
      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div> : null}

      {!loading && !err ? (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <WorkforceActivityTimeline timeline={analytics?.recent_timeline ?? []} userLabel={userLabel} />
            <WorkforceSessionsTable sessions={analytics?.sessions ?? []} />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Pełna lista zdarzeń</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-3">Czas</th>
                    <th className="px-3 py-3">Kto</th>
                    <th className="px-3 py-3">Obszar</th>
                    <th className="px-3 py-3">Akcja</th>
                    <th className="px-3 py-3">Sesja</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                        Brak zapisów — wykonaj operacje w systemie (dokumenty, WMS, ERP, ustawienia).
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                          {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-3 text-slate-900">{userLabel(r.user_id, r.login)}</td>
                        <td className="px-3 py-3 text-slate-700">{humanizeModule(r.module)}</td>
                        <td className="px-3 py-3 font-medium leading-snug text-slate-900">
                          {humanizeActivityAction(r.action_type)}
                        </td>
                        <td className="max-w-[8rem] truncate px-3 py-3 font-mono text-xs text-slate-500" title={r.session_id ?? ""}>
                          {r.session_id ? r.session_id.slice(0, 8) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
