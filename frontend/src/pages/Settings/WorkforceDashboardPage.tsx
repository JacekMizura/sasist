import { useEffect, useMemo, useState } from "react";
import { Activity, Clock, Package, TrendingUp, Users } from "lucide-react";

import { fetchUsers, type AppUserListItem } from "../../api/authApi";
import { fetchWorkforceDashboard } from "../../api/workforceApi";
import { isSuperRole } from "../../auth/isSuperRole";
import { useAuth } from "../../context/AuthContext";

const DEFAULT_TENANT = 1;

function rosterName(u: AppUserListItem): string {
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return n || u.login;
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-600">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
      </div>
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

  const userLabel = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of users) m.set(u.id, rosterName(u));
    return (id: number) => m.get(id) ?? `Pracownik`;
  }, [users]);

  if (!canView) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Brak uprawnienia do podglądu modułu czasu pracy.
      </div>
    );
  }

  const dash = data?.dashboard;
  const costs = data?.costs;

  return (
    <div className="min-w-0 space-y-5">
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Ładowanie…</div>
      ) : null}
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div>
      ) : null}

      {!loading && !err && dash ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Czynności w wybranym okresie"
              value={String(dash.total_events)}
              hint={`${dash.range.from.slice(0, 10)} → ${dash.range.to.slice(0, 10)}`}
              icon={Activity}
            />
            <KpiCard title="Aktywni pracownicy" value={String(dash.distinct_users)} hint="Liczba osób z zapisanymi zdarzeniami" icon={Users} />
            <KpiCard
              title="Szacowane sesje przy komputerze / terminalu"
              value={String(dash.approx_sessions_computed)}
              hint="Łączenie krótkich przerw w jedną sesję"
              icon={Clock}
            />
            <KpiCard
              title="Przyjęcie / rozlokowanie / przesunięcia"
              value={`${dash.action_buckets.receiving_events ?? 0} / ${dash.action_buckets.putaway_events ?? 0} / ${dash.action_buckets.movement_events ?? 0}`}
              hint={`Kompletacja / pakowanie / skany: ${dash.action_buckets.picking_events} / ${dash.action_buckets.packing_events} / ${dash.action_buckets.scan_events}`}
              icon={Package}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Szacunkowy koszt operacyjny</h2>
                <p className="text-xs text-slate-500">{costs?.disclaimer}</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                {costs?.total_estimated_cost_pln?.toFixed(2) ?? "0.00"} PLN
              </span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Pracownik</th>
                    <th className="py-2 pr-3">Godziny aktywności (szac.)</th>
                    <th className="py-2 pr-3">Koszt godziny (szac.)</th>
                    <th className="py-2 text-right">Koszt w okresie</th>
                  </tr>
                </thead>
                <tbody>
                  {(costs?.per_user ?? []).map((row) => (
                    <tr key={row.user_id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-800">{userLabel(row.user_id)}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-700">{row.active_hours_approx.toFixed(2)} h</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-700">
                        {row.employer_hourly_pln != null ? `${row.employer_hourly_pln.toFixed(2)} PLN/h` : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{row.estimated_cost_pln.toFixed(2)} PLN</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-500">
            Dane oparte na logach operacji w WMS. Dokładność zależy od tego, jak często urządzenia wysyłają informację o
            pracy — służą do orientacji kierowniczej, nie do rozliczeń płacowych.
          </p>
        </>
      ) : null}
    </div>
  );
}
