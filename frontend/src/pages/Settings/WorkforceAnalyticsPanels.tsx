import type { WorkforceAnalyticsResponse } from "../../api/workforceApi";
import { humanizeActivityAction, humanizeModule } from "../../utils/workforceUiLabels";

function maxHeatmapCount(buckets: { count: number }[]): number {
  return Math.max(1, ...buckets.map((b) => b.count));
}

export function WorkforceHourlyHeatmap({ buckets }: { buckets: WorkforceAnalyticsResponse["hourly_heatmap"] }) {
  const data = buckets ?? [];
  const peak = maxHeatmapCount(data);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Aktywność wg godziny</h3>
      <p className="mt-1 text-xs text-slate-500">Liczba zdarzeń w poszczególnych godzinach doby (UTC serwera).</p>
      <div className="mt-4 grid grid-cols-12 gap-1 sm:grid-cols-24">
        {data.map((b) => (
          <div key={b.hour} className="flex flex-col items-center gap-1">
            <div
              className="w-full min-h-[2.5rem] rounded-sm bg-indigo-500 transition-opacity"
              style={{ opacity: 0.15 + (b.count / peak) * 0.85, height: `${24 + (b.count / peak) * 48}px` }}
              title={`${b.hour}:00 — ${b.count} zdarzeń`}
            />
            <span className="text-[10px] tabular-nums text-slate-500">{b.hour}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkforceTopModules({ modules }: { modules: WorkforceAnalyticsResponse["top_modules"] }) {
  const rows = modules ?? [];
  const peak = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Top moduły</h3>
      <ul className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <li className="text-sm text-slate-500">Brak danych w wybranym okresie.</li>
        ) : (
          rows.map((r) => (
            <li key={r.module}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-800">{humanizeModule(r.module)}</span>
                <span className="tabular-nums text-slate-600">{r.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(r.count / peak) * 100}%` }} />
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function WorkforceDailyActivity({ days }: { days: WorkforceAnalyticsResponse["daily_breakdown"] }) {
  const rows = days ?? [];
  const peak = Math.max(1, ...rows.map((d) => d.count));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Aktywność dzienna</h3>
      <div className="mt-4 flex items-end gap-1 overflow-x-auto pb-1">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">Brak danych.</p>
        ) : (
          rows.map((d) => (
            <div key={d.date} className="flex min-w-[2rem] flex-col items-center gap-1">
              <div
                className="w-6 rounded-t bg-sky-500"
                style={{ height: `${12 + (d.count / peak) * 72}px` }}
                title={`${d.date}: ${d.count}`}
              />
              <span className="text-[10px] tabular-nums text-slate-500">{d.date.slice(5)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function WorkforceSessionsTable({ sessions }: { sessions: WorkforceAnalyticsResponse["sessions"] }) {
  const rows = sessions ?? [];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Sesje pracy</h3>
        <p className="mt-1 text-xs text-slate-500">Przerwa powyżej 15 min bez aktywności zamyka sesję.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Start</th>
              <th className="px-4 py-3">Koniec</th>
              <th className="px-4 py-3">Zdarzenia</th>
              <th className="px-4 py-3">Aktywny czas</th>
              <th className="px-4 py-3">Moduły</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Brak sesji — wykonaj operacje w systemie.
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={`${s.index}-${s.session_id ?? s.started_at}`} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 tabular-nums text-slate-600">{s.index}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {s.started_at ? new Date(s.started_at).toLocaleString() : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {s.last_at ? new Date(s.last_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium text-slate-900">{s.events}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-800">{s.active_minutes_approx.toFixed(0)} min</td>
                  <td className="px-4 py-3 text-slate-700">
                    {s.top_modules.map((m) => humanizeModule(m.module)).join(", ") || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WorkforceActivityTimeline({
  timeline,
  userLabel,
}: {
  timeline: WorkforceAnalyticsResponse["recent_timeline"];
  userLabel: (id: number | null | undefined, login: string | null | undefined) => string;
}) {
  const rows = timeline ?? [];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Ostatnie działania</h3>
      </div>
      <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
        {rows.length === 0 ? (
          <li className="px-5 py-8 text-center text-sm text-slate-500">Brak zapisów aktywności.</li>
        ) : (
          rows.map((r) => (
            <li key={r.id} className="flex gap-3 px-5 py-3 hover:bg-slate-50/80">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{humanizeActivityAction(r.action_type)}</p>
                <p className="text-xs text-slate-600">
                  {humanizeModule(r.module)} · {userLabel(r.user_id, r.login)}
                </p>
              </div>
              <time className="shrink-0 text-xs tabular-nums text-slate-500">
                {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
              </time>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
