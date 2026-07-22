import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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

const DEFAULT_TENANT = 1;

const MODULE_FILTER_OPTIONS = [
  "",
  "WMS_PICKING",
  "WMS_PACKING",
  "WMS_RECEIVING",
  "WMS_PUTAWAY",
  "WMS_RELOCATION",
  "WMS_RETURNS",
  "WMS_BRAKI",
  "WMS_MOVEMENTS",
  "PRODUCTION",
  "ORDERS",
  "DIRECT_SALES",
  "LABELS",
];

function rosterName(u: AppUserListItem): string {
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return n || u.login;
}

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL");
  } catch {
    return iso;
  }
}

function fmtMinutes(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  if (m < 60) return `${Math.round(m)} min`;
  return `${(m / 60).toFixed(1)} h`;
}

export default function WorkforceActivityPage() {
  const { user, hasPermission, sessionReady } = useAuth();
  const canView = hasPermission("workforce.activity.read") || isSuperRole(user?.role ?? "");
  const [rows, setRows] = useState<WorkforceActivityRow[]>([]);
  const [analytics, setAnalytics] = useState<WorkforceAnalyticsResponse | null>(null);
  const [users, setUsers] = useState<AppUserListItem[]>([]);
  const [filterUserId, setFilterUserId] = useState<number | "">("");
  const [filterModule, setFilterModule] = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = (opts?: { userId?: number; module?: string; warehouseId?: number }) => {
    const uid = opts?.userId ?? (filterUserId === "" ? undefined : filterUserId);
    const mod = opts?.module ?? (filterModule || undefined);
    const whRaw = opts?.warehouseId ?? (filterWarehouse.trim() ? Number(filterWarehouse) : undefined);
    const warehouse_id = whRaw != null && Number.isFinite(whRaw) ? whRaw : undefined;
    const analyticsParams = {
      tenant_id: DEFAULT_TENANT,
      user_id: uid,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    };
    return Promise.all([
      fetchWorkforceActivityLogs({
        tenant_id: DEFAULT_TENANT,
        limit: 300,
        user_id: uid,
        module: mod,
        warehouse_id,
      }),
      fetchWorkforceAnalytics(analyticsParams),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on session / permission
  }, [canView, sessionReady]);

  const userLabel = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of users) m.set(u.id, rosterName(u));
    return (id: number | null | undefined, login: string | null | undefined) => {
      if (id != null && m.has(id)) return m.get(id)!;
      return login?.trim() || "Pracownik";
    };
  }, [users]);

  const operatorCards = useMemo(() => {
    const byUser = new Map<
      number,
      {
        userId: number;
        login: string | null;
        events: WorkforceActivityRow[];
        modules: Map<string, number>;
        firstAt: string | null;
        lastAt: string | null;
        activeMinutes: number;
      }
    >();

    for (const r of rows) {
      if (r.user_id == null) continue;
      let card = byUser.get(r.user_id);
      if (!card) {
        card = {
          userId: r.user_id,
          login: r.login,
          events: [],
          modules: new Map(),
          firstAt: r.created_at,
          lastAt: r.created_at,
          activeMinutes: 0,
        };
        byUser.set(r.user_id, card);
      }
      card.events.push(r);
      const mod = r.module || "UNKNOWN";
      card.modules.set(mod, (card.modules.get(mod) ?? 0) + 1);
      if (r.created_at) {
        if (!card.firstAt || r.created_at < card.firstAt) card.firstAt = r.created_at;
        if (!card.lastAt || r.created_at > card.lastAt) card.lastAt = r.created_at;
      }
    }

    for (const p of analytics?.per_user ?? []) {
      const card = byUser.get(p.user_id);
      if (card) card.activeMinutes = p.active_minutes_approx ?? 0;
    }

    return [...byUser.values()].sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
  }, [rows, analytics]);

  const applyFilters = () => {
    setLoading(true);
    setErr(null);
    void load()
      .catch(() => setErr("Nie udało się przefiltrować aktywności."))
      .finally(() => setLoading(false));
  };

  const toggleExpand = (uid: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

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
              setFilterUserId(v === "" ? "" : Number(v));
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Moduł</span>
          <select
            className="min-w-[12rem] rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
          >
            <option value="">Wszystkie</option>
            {MODULE_FILTER_OPTIONS.filter(Boolean).map((m) => (
              <option key={m} value={m}>
                {humanizeModule(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Magazyn (ID)</span>
          <input
            type="number"
            min={1}
            placeholder="opcjonalnie"
            className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={filterWarehouse}
            onChange={(e) => setFilterWarehouse(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Od</span>
          <input
            type="date"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Do</span>
          <input
            type="date"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={applyFilters}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Zastosuj
        </button>
        <p className="basis-full text-xs text-slate-500">
          Tylko realne operacje (bez pollingu i technicznego API) · sesja ≤ 15 min przerwy
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Ładowanie…
        </div>
      ) : null}
      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div> : null}

      {!loading && !err ? (
        <div className="space-y-3">
          {operatorCards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
              <p className="text-base font-semibold text-slate-800">Widok szczegółowej aktywności</p>
              <p className="mt-2 text-sm text-slate-500">
                Brak operacyjnych zdarzeń w wybranym zakresie — wykonaj pracę w WMS/ERP i odśwież.
              </p>
            </div>
          ) : (
            operatorCards.map((card) => {
              const open = expanded.has(card.userId);
              const topMods = [...card.modules.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([m]) => humanizeModule(m));
              return (
                <div
                  key={card.userId}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(card.userId)}
                    className="flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-slate-50/80"
                  >
                    <span className="mt-1 text-slate-400">
                      {open ? (
                        <ChevronDown className="h-5 w-5" aria-hidden />
                      ) : (
                        <ChevronRight className="h-5 w-5" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">
                          {userLabel(card.userId, card.login)}
                        </h3>
                        <span className="text-xs tabular-nums text-slate-500">
                          {card.events.length} operacji · {fmtMinutes(card.activeMinutes)}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <span className="text-slate-400">Pierwsza: </span>
                          {fmtTs(card.firstAt)}
                        </div>
                        <div>
                          <span className="text-slate-400">Ostatnia: </span>
                          {fmtTs(card.lastAt)}
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400">Moduły: </span>
                          {topMods.length ? topMods.join(" · ") : "—"}
                        </div>
                      </div>
                    </div>
                  </button>
                  {open ? (
                    <div className="border-t border-slate-100 bg-slate-50/40">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[40rem] text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                              <th className="px-4 py-2">Czas</th>
                              <th className="px-4 py-2">Moduł</th>
                              <th className="px-4 py-2">Akcja</th>
                              <th className="px-4 py-2">Magazyn</th>
                            </tr>
                          </thead>
                          <tbody>
                            {card.events.slice(0, 80).map((r) => (
                              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                                <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                                  {fmtTs(r.created_at)}
                                </td>
                                <td className="px-4 py-2 text-slate-700">{humanizeModule(r.module)}</td>
                                <td className="px-4 py-2 font-medium text-slate-900">
                                  {humanizeActivityAction(r.action_type)}
                                </td>
                                <td className="px-4 py-2 tabular-nums text-slate-500">
                                  {r.warehouse_id ?? "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
