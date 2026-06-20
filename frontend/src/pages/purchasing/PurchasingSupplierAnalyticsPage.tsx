import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { AlertTriangle, Award, Star, TrendingDown, X } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../../api/axios";
import {
  fetchPurchasingSupplierAnalytics,
  type PurchasingSupplierAnalyticsPayload,
  type SupplierAnalyticsRow,
  type SupplierAnalyticsSeries,
} from "../../api/purchasingSupplierAnalyticsApi";
import { usePurchasingModuleContextOptional } from "../../modules/purchasing/context/PurchasingModuleContext";
import {
  PurchasingContentArea,
  PurchasingFilterBar,
  PurchasingFilterField,
  PurchasingKpiCard,
  PurchasingKpiGrid,
  PurchasingPageHeader,
  PurchasingPageShell,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingFilterButtonClass,
  purchasingSelectClass,
} from "../../modules/purchasing/ui";

type Tenant = { id: number; name: string };

function fmtMoney(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("pl-PL", { maximumFractionDigits: digits });
}

function scoreTone(score: number | null, insufficient: boolean): string {
  if (insufficient || score == null) return "bg-slate-100 text-slate-600 ring-slate-200";
  if (score >= 90) return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  if (score >= 75) return "bg-sky-100 text-sky-900 ring-sky-200";
  if (score >= 50) return "bg-amber-100 text-amber-950 ring-amber-200";
  return "bg-red-100 text-red-900 ring-red-200";
}

/** Etykieta biznesowa zgodna z progami 90 / 75 / 50. */
function scoreOcena(score: number | null, insufficient: boolean): string {
  if (insufficient || score == null) return "Brak oceny";
  if (score >= 90) return "Świetny";
  if (score >= 75) return "Dobry";
  if (score >= 50) return "Średni";
  return "Ryzykowny";
}

function riskBadge(risk: string): string {
  switch (risk) {
    case "low":
      return "bg-emerald-50 text-emerald-900 ring-emerald-200";
    case "medium":
      return "bg-amber-50 text-amber-950 ring-amber-200";
    default:
      return "bg-red-50 text-red-900 ring-red-200";
  }
}

function riskLabel(risk: string): string {
  switch (risk) {
    case "low":
      return "Niski";
    case "medium":
      return "Średni";
    default:
      return "Wysoki";
  }
}

export default function PurchasingSupplierAnalyticsPage() {
  const moduleCtx = usePurchasingModuleContextOptional();
  const location = useLocation();
  const isSuppliersModule = location.pathname.startsWith("/suppliers");
  const [searchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [rangeDays, setRangeDays] = useState<30 | 90 | 365>(90);
  const [data, setData] = useState<PurchasingSupplierAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [drawerSid, setDrawerSid] = useState<number | null>(null);
  const [drawerRow, setDrawerRow] = useState<SupplierAnalyticsRow | null>(null);
  const [drawerSeries, setDrawerSeries] = useState<SupplierAnalyticsSeries | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  useEffect(() => {
    void api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length > 0 && !list.some((t) => t.id === tenantId)) setTenantId(list[0].id);
      })
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) setTenantId(n);
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchPurchasingSupplierAnalytics({ tenantId, rangeDays });
      setData(d);
    } catch {
      setErr("Nie udało się wczytać analityki dostawców.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, rangeDays]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (drawerSid == null) {
      setDrawerRow(null);
      setDrawerSeries(null);
      return;
    }
    setDrawerLoading(true);
    void fetchPurchasingSupplierAnalytics({ tenantId, supplierId: drawerSid, rangeDays })
      .then((d) => {
        setDrawerRow(d.rows[0] ?? null);
        setDrawerSeries(d.series);
      })
      .catch(() => {
        setDrawerRow(null);
        setDrawerSeries(null);
      })
      .finally(() => setDrawerLoading(false));
  }, [drawerSid, tenantId, rangeDays]);

  const kpis = useMemo(() => {
    const rows = data?.rows ?? [];
    const scored = rows.filter((r) => r.score != null && !r.insufficient_data);
    if (scored.length === 0) {
      return {
        best: null as SupplierAnalyticsRow | null,
        worst: null as SupplierAnalyticsRow | null,
        avgScore: null as number | null,
        delayed: 0,
      };
    }
    const byScore = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const best = byScore[0];
    const worst = byScore[byScore.length - 1];
    const avg = scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length;
    const delayed = scored.filter(
      (r) =>
        (r.on_time_rate != null && r.on_time_rate < 80) ||
        (r.on_time_percent != null && r.on_time_percent < 80) ||
        (r.avg_delay_days != null && (r.avg_delay_days ?? 0) > 2),
    ).length;
    return { best, worst, avgScore: avg, delayed };
  }, [data]);

  const td = "px-4 py-3 text-sm text-slate-800 sm:px-6 sm:py-4";

  const openDrawer = (sid: number) => setDrawerSid(sid);

  const replenishmentHref = (sid: number) =>
    `/purchasing/replenishment?tenant_id=${tenantId}&supplier_id=${sid}`;
  const supplierEditHref = (sid: number) => `/suppliers?tenant_id=${tenantId}&edit=${sid}`;
  const ordersHref = `/purchasing/orders?tenant_id=${tenantId}`;

  return (
    <PurchasingContentArea>
      <PurchasingPageShell
        header={
          <PurchasingPageHeader
            title={isSuppliersModule ? "Ocena" : "Ocena dostawców"}
            subtitle="Ranking dostawców wg terminowości, cen i wolumenu zakupów."
          />
        }
        status={
          err ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {err}
              <button type="button" className="ml-3 underline" onClick={() => void load()}>
                Spróbuj ponownie
              </button>
            </div>
          ) : loading ? (
            <p className="text-sm text-slate-500">Ładowanie danych…</p>
          ) : null
        }
        kpis={
          <PurchasingKpiGrid columns={4}>
            <PurchasingKpiCard
              title="Najlepszy dostawca"
              value={kpis.best?.score ?? "—"}
              subtitle={kpis.best?.supplier_name ?? "Brak ocenionych dostawców"}
              tone="emerald"
              icon={<Award aria-hidden />}
            />
            <PurchasingKpiCard
              title="Najsłabszy dostawca"
              value={kpis.worst?.score ?? "—"}
              subtitle={kpis.worst?.supplier_name ?? "Brak ocenionych dostawców"}
              tone="amber"
              icon={<TrendingDown aria-hidden />}
            />
            <PurchasingKpiCard
              title="Średnia ocena"
              value={kpis.avgScore != null ? kpis.avgScore.toFixed(1) : "—"}
              subtitle="Skala 0–100, dostawcy z kompletem danych"
              tone="blue"
              icon={<Star aria-hidden />}
            />
            <PurchasingKpiCard
              title="Dostawcy z problemami terminów"
              value={kpis.delayed}
              subtitle="Terminowość poniżej 80% lub śr. opóźnienie powyżej 2 dni"
              tone="red"
              icon={<AlertTriangle aria-hidden />}
            />
          </PurchasingKpiGrid>
        }
        filters={
          <PurchasingFilterBar
            actions={
              <button type="button" className={purchasingFilterButtonClass} onClick={() => void load()} disabled={loading}>
                Odśwież
              </button>
            }
          >
            {!moduleCtx ? (
              <PurchasingFilterField label="Podmiot">
                <select className={purchasingSelectClass} value={tenantId} onChange={(e) => setTenantId(Number(e.target.value))}>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (#{t.id})
                    </option>
                  ))}
                </select>
              </PurchasingFilterField>
            ) : null}
            <PurchasingFilterField label="Okres">
              <select
                className={purchasingSelectClass}
                value={rangeDays}
                onChange={(e) => setRangeDays(Number(e.target.value) as 30 | 90 | 365)}
              >
                <option value={30}>30 dni</option>
                <option value={90}>90 dni</option>
                <option value={365}>365 dni</option>
              </select>
            </PurchasingFilterField>
          </PurchasingFilterBar>
        }
        table={
          <PurchasingTableSection
            title="Ranking dostawców"
            subtitle={`Okres ${rangeDays} dni — kliknij wiersz, aby zobaczyć szczegóły`}
            indicatorClass="bg-indigo-500"
          >
            <table className="w-full min-w-full text-left text-sm">
              <PurchasingTableHeader>
                <tr>
                  <th className="px-6 py-4 text-left">#</th>
                  <th className="px-6 py-4 text-left">Dostawca</th>
                  <th className="px-6 py-4 text-left">Dostawy PZ</th>
                  <th className="px-6 py-4 text-left">PO planowane</th>
                  <th className="px-6 py-4 text-left">Terminowość (PZ)</th>
                  <th className="px-6 py-4 text-left">Śr. interwał dostaw (dni)</th>
                  <th className="px-6 py-4 text-left">Śr. opóźnienie (dni)</th>
                  <th className="px-6 py-4 text-left">Trend ceny zakupu (%)</th>
                  <th className="px-6 py-4 text-left">Wartość zakupów netto (PLN)</th>
                  <th className="px-6 py-4 text-left">Ocena (0–100)</th>
                  <th className="px-6 py-4 text-left">Ryzyko</th>
                </tr>
              </PurchasingTableHeader>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={11} className={`${td} text-center text-slate-500`}>
                  Ładowanie…
                </td>
              </tr>
            ) : null}
            {!loading && (data?.rows.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={11} className={`${td} text-center text-slate-500`}>
                  Brak dostawców dla tego podmiotu.
                </td>
              </tr>
            ) : null}
            {(data?.rows ?? []).map((r) => (
              <tr
                key={r.supplier_id}
                className="cursor-pointer transition-colors hover:bg-blue-50/30"
                onClick={() => openDrawer(r.supplier_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openDrawer(r.supplier_id);
                  }
                }}
                tabIndex={0}
                role="button"
              >
                <td className={`${td} tabular-nums text-slate-600`}>{r.rank}</td>
                <td className={`${td} font-medium text-slate-800`}>{r.supplier_name}</td>
                <td className={`${td} tabular-nums text-slate-700`}>{r.deliveries_count ?? r.total_orders}</td>
                <td className={`${td} tabular-nums text-slate-700`}>{r.planned_orders_count ?? 0}</td>
                <td className={td}>{fmtPct(r.on_time_rate ?? r.on_time_percent)}</td>
                <td className={td}>{fmtNum(r.avg_delivery_interval)}</td>
                <td className={td}>{fmtNum(r.avg_delay_days)}</td>
                <td className={td}>{fmtPct(r.price_trend ?? r.avg_buy_price_change_percent)}</td>
                <td className={`${td} tabular-nums text-slate-700`}>{fmtMoney(r.total_purchase_value_net ?? r.total_value)}</td>
                <td className={td}>
                  {r.insufficient_data ? (
                    <span className="text-xs text-amber-800">Za mało historii</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${scoreTone(r.score, r.insufficient_data)}`}
                      >
                        {r.score == null ? "—" : r.score}
                      </span>
                      <span className="text-xs text-slate-600">{scoreOcena(r.score, r.insufficient_data)}</span>
                    </div>
                  )}
                </td>
                <td className={td}>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${riskBadge(r.risk_level)}`}>
                    {riskLabel(r.risk_level)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
            </table>
          </PurchasingTableSection>
        }
      />

      {drawerSid != null ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="presentation" onClick={() => setDrawerSid(null)}>
          <div
            className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{drawerRow?.supplier_name ?? "Dostawca"}</h2>
                <p className="text-xs text-slate-500">Szczegóły i trendy (okres {rangeDays} dni)</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Zamknij"
                onClick={() => setDrawerSid(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 px-5 py-4">
              {drawerLoading ? <p className="text-sm text-slate-500">Ładowanie wykresów…</p> : null}
              {!drawerLoading && drawerRow?.insufficient_data ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Niewystarczające dane historyczne w tym oknie — brak zamówień i przyjętych dostaw.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Link
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                  to={supplierEditHref(drawerSid)}
                >
                  Otwórz dostawcę
                </Link>
                <Link
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                  to={replenishmentHref(drawerSid)}
                >
                  Utwórz PO
                </Link>
                <Link className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800" to={replenishmentHref(drawerSid)}>
                  Porównaj ceny (generator)
                </Link>
                <Link className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800" to={ordersHref}>
                  Lista zamówień
                </Link>
              </div>

              {drawerSeries && drawerSeries.score_trend.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Trend oceny (miesięcznie)</h3>
                  <div className="mt-2 h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={drawerSeries.score_trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={32} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="score" name="Ocena" stroke="#0f172a" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}

              {drawerSeries && drawerSeries.punctuality_trend.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Terminowość dostaw (%)</h3>
                  <div className="mt-2 h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={drawerSeries.punctuality_trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={32} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="on_time_percent" name="Terminowość %" stroke="#0284c7" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}

              {drawerSeries && drawerSeries.order_history.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Historia zamówień</h3>
                  <div className="mt-2 h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={drawerSeries.order_history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={28} allowDecimals={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={44} />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="left" dataKey="orders" name="Liczba PO" fill="#64748b" radius={[4, 4, 0, 0]} />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="value"
                          name="Wartość"
                          stroke="#0f172a"
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </PurchasingContentArea>
  );
}
