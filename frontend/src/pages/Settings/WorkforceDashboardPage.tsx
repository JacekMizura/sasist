import { useEffect, useMemo, useState } from "react";
import { Activity, Clock, MoreHorizontal, Package, TrendingUp, Users } from "lucide-react";

import { fetchUsers, type AppUserListItem } from "../../api/authApi";
import { fetchWorkforceDashboard } from "../../api/workforceApi";
import { isSuperRole } from "../../auth/isSuperRole";
import { useAuth } from "../../context/AuthContext";

const DEFAULT_TENANT = 1;

function rosterName(u: AppUserListItem): string {
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return n || u.login;
}

function initials(u?: AppUserListItem): string {
  if (!u) return "?";
  const a = (u.first_name?.[0] ?? "").toUpperCase();
  const b = (u.last_name?.[0] ?? "").toUpperCase();
  if (a || b) return `${a}${b}`;
  return (u.login?.slice(0, 2) ?? "?").toUpperCase();
}

function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: typeof Activity;
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <span className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {title}
          </span>
          <span className="text-3xl font-bold tabular-nums text-slate-900">
            {value}
          </span>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-600 shadow-sm">
          <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden />
        </div>
      </div>
      {hint ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <span className="text-xs font-medium text-slate-500">{hint}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function WorkforceDashboardPage() {
  const { user, hasPermission, sessionReady } = useAuth();
  const canView = hasPermission("workforce.dashboard") || isSuperRole(user?.role ?? "");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchWorkforceDashboard>> | null>(null);
  const [users, setUsers] = useState<AppUserListItem[]>([]);

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
    fetchWorkforceDashboard({ tenant_id: DEFAULT_TENANT })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setErr("Nie udało się wczytać danych o czasie pracy i aktywności.");
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
      void fetchWorkforceDashboard({ tenant_id: DEFAULT_TENANT })
        .then(setData)
        .catch(() => {});
    }, 30_000);
    return () => window.clearInterval(t);
  }, [canView]);

  // Zoptymalizowana mapa przechowująca całe obiekty użytkowników
  const userMap = useMemo(() => {
    const m = new Map<number, AppUserListItem>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  if (!canView) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
        Brak uprawnienia do podglądu modułu czasu pracy.
      </div>
    );
  }

  const dash = data?.dashboard;
  const costs = data?.costs;

  return (
    <div className="min-w-0 space-y-6 bg-white">
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Ładowanie danych…
        </div>
      ) : null}
      
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
          {err}
        </div>
      ) : null}

      {!loading && !err && dash ? (
        <>
          {/* Karty KPI (Góra) */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Aktywności (Raport)"
              value={String(dash.total_events)}
              hint={`${dash.range.from.slice(0, 10)} → ${dash.range.to.slice(0, 10)}`}
              icon={Activity}
            />
            <KpiCard
              title="Aktywni pracownicy"
              value={String(dash.distinct_users)}
              hint="Liczba osób z zapisanymi zdarzeniami"
              icon={Users}
            />
            <KpiCard
              title="Sesje terminalowe"
              value={String(dash.approx_sessions_computed)}
              hint="Służące do zliczania czasu pracy"
              icon={Clock}
            />
            <KpiCard
              title="Suma ruchów (K/P/Z)"
              value={`${dash.action_buckets.receiving_events ?? 0} / ${dash.action_buckets.putaway_events ?? 0} / ${dash.action_buckets.movement_events ?? 0}`}
              hint={`Kompletacja / pakowanie / zmiana strefy: ${dash.action_buckets.picking_events} / ${dash.action_buckets.packing_events} / ${dash.action_buckets.scan_events}`}
              icon={Package}
            />
          </div>

          {/* Tabela szczegółów (Dół) */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 bg-white p-5 lg:p-6">
              <div>
                <h2 className="text-base font-semibold text-slate-900 uppercase tracking-wide">
                  Szacunkowy koszt operacyjny
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {costs?.disclaimer || "Szacunki oparte na: (koszt pracodawcy) × (czas aktywności)"}
                </p>
              </div>
              <div className="shrink-0">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800 shadow-sm">
                  <TrendingUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  {costs?.total_estimated_cost_pln?.toFixed(2) ?? "0.00"} PLN
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-6 py-4">Pracownik</th>
                    <th className="px-6 py-4">Suma Godzin (SZAC.)</th>
                    <th className="px-6 py-4">Stawka Godz. (SZAC.)</th>
                    <th className="px-6 py-4">Koszt w Okresie</th>
                    <th className="px-6 py-4 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {(costs?.per_user ?? []).map((row) => {
                    const u = userMap.get(row.user_id);
                    const displayName = u ? rosterName(u) : `Pracownik (${row.user_id})`;
                    const init = initials(u);

                    return (
                      <tr key={row.user_id} className="group transition-colors hover:bg-slate-50/60">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-slate-200"
                              aria-hidden
                            >
                              {init}
                            </span>
                            <span className="font-semibold text-slate-900">{displayName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium tabular-nums text-slate-900">
                          {row.active_hours_approx.toFixed(2)} h
                        </td>
                        <td className="px-6 py-4 font-medium tabular-nums text-slate-600">
                          {row.employer_hourly_pln != null
                            ? `${row.employer_hourly_pln.toFixed(2)} PLN/h`
                            : "—"}
                        </td>
                        <td className="px-6 py-4 font-bold tabular-nums text-emerald-700">
                          {row.estimated_cost_pln.toFixed(2)} PLN
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            aria-label="Akcje"
                            className="inline-flex rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          >
                            <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Footer / Disclaimer */}
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <p className="text-xs leading-relaxed text-slate-500">
                Dane oparte na logach operacji w WMS. Dokładność zależy od tego, jak często urządzenia wysyłają
                informację o pracy — służą do orientacji kierowniczej, nie do rozliczeń płacowych.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}