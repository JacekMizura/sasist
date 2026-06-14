import { useCallback, useEffect, useState } from "react";
import {
  getBundleCapacityReport,
  getBundleIntelligenceDashboard,
  getBundleReplenishmentForecast,
  getBundleSlottingRecommendations,
  type BundleCapacityReport,
  type BundleDashboard,
  type BundleKpiRow,
  type BundleReplenishmentRow,
  type BundleSlottingPair,
} from "../../api/bundleIntelligenceApi";

const DEFAULT_TENANT_ID = 1;

type TabId = "analytics" | "slotting" | "replenishment" | "capacity";

const TABS: { id: TabId; label: string }[] = [
  { id: "analytics", label: "Analytics" },
  { id: "slotting", label: "Slotting" },
  { id: "replenishment", label: "Replenishment" },
  { id: "capacity", label: "Capacity" },
];

function KpiTable({ title, rows, showGrowth }: { title: string; rows: BundleKpiRow[]; showGrowth?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <h3 className="px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-50 border-b border-slate-200">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-slate-600">Bundle</th>
              <th className="text-right px-3 py-2 font-medium text-slate-600">Sprzedaż</th>
              <th className="text-right px-3 py-2 font-medium text-slate-600">Przychód</th>
              <th className="text-right px-3 py-2 font-medium text-slate-600">Marża</th>
              <th className="text-right px-3 py-2 font-medium text-slate-600">Zwroty</th>
              <th className="text-right px-3 py-2 font-medium text-slate-600">Pick [s]</th>
              <th className="text-right px-3 py-2 font-medium text-slate-600">Pack [s]</th>
              <th className="text-right px-3 py-2 font-medium text-slate-600">RK [s]</th>
              {showGrowth && <th className="text-right px-3 py-2 font-medium text-slate-600">Wzrost</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showGrowth ? 9 : 8} className="px-4 py-6 text-center text-slate-500">
                  Brak danych w okresie.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={`${title}-${r.bundle_id}`}>
                  <td className="px-3 py-2">{r.bundle_name}</td>
                  <td className="px-3 py-2 text-right">{r.units_sold}</td>
                  <td className="px-3 py-2 text-right">{r.revenue_net.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    {r.margin_net != null ? `${r.margin_net.toFixed(2)} (${r.margin_percent ?? "—"}%)` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{r.returns_count}</td>
                  <td className="px-3 py-2 text-right">{r.avg_pick_seconds ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.avg_pack_seconds ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.avg_consolidation_seconds ?? "—"}</td>
                  {showGrowth && (
                    <td className="px-3 py-2 text-right">
                      {r.growth_percent != null ? `${r.growth_percent.toFixed(1)}%` : "—"}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls =
    priority === "high"
      ? "bg-amber-100 text-amber-800"
      : priority === "medium"
        ? "bg-blue-100 text-blue-800"
        : "bg-slate-100 text-slate-600";
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{priority}</span>;
}

export default function BundleIntelligencePage() {
  const [tab, setTab] = useState<TabId>("analytics");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(30);

  const [dashboard, setDashboard] = useState<BundleDashboard | null>(null);
  const [slotting, setSlotting] = useState<BundleSlottingPair[]>([]);
  const [replenishment, setReplenishment] = useState<BundleReplenishmentRow[]>([]);
  const [capacity, setCapacity] = useState<BundleCapacityReport | null>(null);

  const loadTab = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "analytics") {
        setDashboard(await getBundleIntelligenceDashboard(DEFAULT_TENANT_ID, { periodDays }));
      } else if (tab === "slotting") {
        setSlotting(await getBundleSlottingRecommendations(DEFAULT_TENANT_ID));
      } else if (tab === "replenishment") {
        setReplenishment(await getBundleReplenishmentForecast(DEFAULT_TENANT_ID));
      } else {
        setCapacity(await getBundleCapacityReport(DEFAULT_TENANT_ID));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Błąd ładowania");
    } finally {
      setLoading(false);
    }
  }, [tab, periodDays]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  return (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold text-slate-800 mb-2">Bundle Warehouse Intelligence</h2>
      <p className="text-slate-600 mb-4 text-sm">
        Raporty i rekomendacje na podstawie danych bundle — bez automatycznych decyzji magazynowych.
      </p>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "analytics" && (
        <div className="mb-4 flex items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Okres [dni]</span>
            <select
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadTab()}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Odśwież
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800 text-sm">{error}</div>
      )}

      {loading && <p className="text-slate-500">Ładowanie…</p>}

      {!loading && tab === "analytics" && dashboard && (
        <div className="space-y-6">
          <p className="text-xs text-slate-500">Okres analizy: {dashboard.period_days} dni</p>
          <KpiTable title="Top Bundle (sprzedaż)" rows={dashboard.top_bundles} />
          <KpiTable title="Najszybciej rosnące Bundle" rows={dashboard.fastest_growing} showGrowth />
          <KpiTable title="Bundle z największą marżą" rows={dashboard.highest_margin} />
          <KpiTable title="Bundle z największą liczbą zwrotów" rows={dashboard.most_returns} />
        </div>
      )}

      {!loading && tab === "slotting" && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-slate-600">SKU A</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">SKU B</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">Współwyst.</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Lokalizacje</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Priorytet</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Rekomendacja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slotting.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Brak par spełniających próg współwystępowania.
                  </td>
                </tr>
              ) : (
                slotting.map((r) => (
                  <tr key={`${r.product_a_id}-${r.product_b_id}`}>
                    <td className="px-4 py-2">
                      {r.product_a_name}
                      {r.product_a_sku ? ` (${r.product_a_sku})` : ""}
                    </td>
                    <td className="px-4 py-2">
                      {r.product_b_name}
                      {r.product_b_sku ? ` (${r.product_b_sku})` : ""}
                    </td>
                    <td className="px-4 py-2 text-right">{(r.co_occurrence_rate * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2 text-xs">
                      {r.location_a ?? "—"} → {r.location_b ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <PriorityBadge priority={r.priority} />
                    </td>
                    <td className="px-4 py-2 text-slate-600">{r.recommendation}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === "replenishment" && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Bundle</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Składnik</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">Prognoza bundle</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">Szt./bundle</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">Zapotrzebowanie</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Rekomendacja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {replenishment.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Brak aktywnych bundle ze sprzedażą w okresie.
                  </td>
                </tr>
              ) : (
                replenishment.map((r) => (
                  <tr key={`${r.bundle_id}-${r.product_id}`}>
                    <td className="px-4 py-2">{r.bundle_name}</td>
                    <td className="px-4 py-2">
                      {r.product_name}
                      {r.sku ? ` (${r.sku})` : ""}
                    </td>
                    <td className="px-4 py-2 text-right">{r.bundle_qty_forecast.toFixed(1)}</td>
                    <td className="px-4 py-2 text-right">{r.qty_per_bundle}</td>
                    <td className="px-4 py-2 text-right font-medium">{r.total_component_qty}</td>
                    <td className="px-4 py-2 text-slate-600 text-xs">{r.recommendation}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === "capacity" && capacity && (
        <div className="space-y-8">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              Wózki / koszyki — przeciążone: {capacity.overloaded_carts}
            </h3>
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Kod</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Wykorzystanie</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Zam. bundle</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Rekomendacja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {capacity.cart_rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                        Brak wózków w magazynie.
                      </td>
                    </tr>
                  ) : (
                    capacity.cart_rows.map((r) => (
                      <tr key={r.cart_id}>
                        <td className="px-4 py-2">{r.cart_code ?? `#${r.cart_id}`}</td>
                        <td className="px-4 py-2 text-right">{r.utilization_percent}%</td>
                        <td className="px-4 py-2 text-right">{r.bundle_orders_count}</td>
                        <td className="px-4 py-2 text-slate-600 text-xs">{r.recommendation}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              Regały kompletacyjne (RK) — przeciążone segmenty: {capacity.overloaded_rack_segments}
            </h3>
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">RK</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Segment</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Wypełnienie</th>
                    <th className="text-center px-4 py-2 font-medium text-slate-600">Bundle</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Rekomendacja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {capacity.rack_rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        Brak regałów kompletacyjnych.
                      </td>
                    </tr>
                  ) : (
                    capacity.rack_rows.map((r, i) => (
                      <tr key={`${r.rack_id}-${r.segment_label}-${i}`}>
                        <td className="px-4 py-2">{r.rack_name}</td>
                        <td className="px-4 py-2">{r.segment_label ?? "—"}</td>
                        <td className="px-4 py-2 text-right">{r.fill_percent}%</td>
                        <td className="px-4 py-2 text-center">{r.has_bundle ? "tak" : "—"}</td>
                        <td className="px-4 py-2 text-slate-600 text-xs">{r.recommendation}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
