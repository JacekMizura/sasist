import type { PackagingIntelligenceDashboardApi } from "../../api/packagingIntelligenceApi";

const th = "border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500";
const td = "border-b border-slate-100 px-3 py-2 text-sm tabular-nums text-slate-900";
const tdLabel = "border-b border-slate-100 px-3 py-2 text-sm font-medium text-slate-700";

/** Only metrics with real backend values — no atrapa confidence/fill/missing/failed. */
function kpiItems(d: PackagingIntelligenceDashboardApi) {
  return [
    { key: "rules", label: "Aktywne reguły dopasowania", value: String(d.suggestions_total) },
    {
      key: "override",
      label: "Udział nadpisań",
      value:
        d.override_rate_pct != null && Number.isFinite(d.override_rate_pct)
          ? `${d.override_rate_pct.toFixed(1)}%`
          : "—",
    },
  ];
}

export function PackagingIntelligenceKpiLoading() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-4 text-sm text-slate-500">
      Ładowanie metryk z API…
    </div>
  );
}

function KpiOperationalTable({ rows }: { rows: { key: string; label: string; value: string }[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
      <table className="w-full min-w-[320px] border-collapse">
        <thead>
          <tr>
            <th className={th}>Metryka</th>
            <th className={`${th} text-right`}>Wartość</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-slate-50/80">
              <td className={tdLabel}>{r.label}</td>
              <td className={`${td} text-right font-semibold`}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Compact KPI (3D Matching Widok — shared helper). */
export function PackagingIntelligenceKpiCompact({
  dashboard,
}: {
  dashboard: PackagingIntelligenceDashboardApi | null;
}) {
  if (!dashboard) return <PackagingIntelligenceKpiLoading />;
  return <KpiOperationalTable rows={kpiItems(dashboard)} />;
}

export function PackagingIntelligenceKpiFull({
  dashboard,
}: {
  dashboard: PackagingIntelligenceDashboardApi | null;
}) {
  if (!dashboard) return <PackagingIntelligenceKpiLoading />;
  const rows = kpiItems(dashboard);
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Okres raportu: <span className="font-semibold text-slate-800">{dashboard.period_days} dni</span>
      </p>
      <KpiOperationalTable rows={rows} />
      {dashboard.top_packages.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
          <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Najczęstsze kartony
          </p>
          <div className="max-h-56 overflow-auto">
            <table className="w-full min-w-[400px] border-collapse text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className={th}>ID kartonu</th>
                  <th className={th}>Nazwa</th>
                  <th className={`${th} text-right`}>Użycia</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.top_packages.map((pkg, i) => {
                  const p = pkg as Record<string, unknown>;
                  const id = String(p.carton_id ?? p.id ?? "—");
                  const name = String(p.name ?? "—");
                  const uses = String(p.uses ?? p.count ?? "—");
                  return (
                    <tr key={i} className="hover:bg-slate-50/80">
                      <td className={td}>{id}</td>
                      <td className={`${td} max-w-[16rem] truncate font-medium text-slate-800`}>{name}</td>
                      <td className={`${td} text-right`}>{uses}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {dashboard.note ? <p className="text-xs text-slate-500">{dashboard.note}</p> : null}
    </div>
  );
}

export function PackagingIntelligenceAuditPlaceholderTable() {
  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-4 text-sm text-slate-500">
      Brak szczegółowego audytu propozycji w tym widoku.
    </p>
  );
}
