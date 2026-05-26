import type { PackagingIntelligenceDashboardApi } from "../../api/packagingIntelligenceApi";

const th = "border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500";
const td = "border-b border-slate-100 px-3 py-2 text-sm tabular-nums text-slate-900";
const tdLabel = "border-b border-slate-100 px-3 py-2 text-sm font-medium text-slate-700";

function kpiItems(d: PackagingIntelligenceDashboardApi) {
  return [
    { key: "suggestions", label: "Propozycje (łącznie)", value: String(d.suggestions_total) },
    {
      key: "override",
      label: "Udział nadpisań",
      value:
        d.override_rate_pct != null && Number.isFinite(d.override_rate_pct) ? `${d.override_rate_pct.toFixed(1)}%` : "—",
    },
    {
      key: "confidence",
      label: "Śr. pewność",
      value:
        d.avg_confidence != null && Number.isFinite(d.avg_confidence)
          ? `${(d.avg_confidence * 100).toFixed(0)}%`
          : "—",
    },
    {
      key: "fill",
      label: "Śr. wypełnienie",
      value:
        d.avg_fill_pct != null && Number.isFinite(d.avg_fill_pct) ? `${d.avg_fill_pct.toFixed(1)}%` : "—",
    },
    { key: "nodim", label: "Produkty bez wymiarów", value: String(d.products_missing_dimensions) },
    { key: "failed", label: "Nieudane propozycje", value: String(d.failed_suggestions) },
  ];
}

export function PackagingIntelligenceKpiLoading() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-4 text-sm text-slate-500">Ładowanie metryk z API…</div>
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

/** Dashboard — zwięzła tabela operacyjna (jak panel magazynowy). */
export function PackagingIntelligenceKpiCompact({
  dashboard,
}: {
  dashboard: PackagingIntelligenceDashboardApi | null;
}) {
  if (!dashboard) return <PackagingIntelligenceKpiLoading />;
  const all = kpiItems(dashboard);
  const pick = all.filter((x) => ["suggestions", "override", "confidence", "fill"].includes(x.key));
  return <KpiOperationalTable rows={pick} />;
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
      <p className="rounded-lg border border-amber-200/90 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">{dashboard.note}</p>
    </div>
  );
}

/** Pusta tabela audytu — szkielet pod listę z API. */
export function PackagingIntelligenceAuditPlaceholderTable({
  moduleLabel,
  colSource,
}: {
  moduleLabel: string;
  colSource: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr>
            <th className={th}>Czas</th>
            <th className={th}>Zamówienie</th>
            <th className={th}>{colSource}</th>
            <th className={th}>Karton</th>
            <th className={th}>Operator</th>
            <th className={th}>Zdarzenie</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
              Brak wierszy audytu — podłącz endpoint historii dopasowań ({moduleLabel}). Tabela jest przygotowana pod operacyjny
              eksport i masowe filtry.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
