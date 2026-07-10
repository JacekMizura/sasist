import { useEffect, useState } from "react";
import { getTenantInventoryValue } from "../../api/analysisApi";
import { getSystemHealth } from "../../api/systemApi";
import {
  dashboardCardPadding,
  dashboardKpiGridGap,
  dashboardSurfaceCard,
} from "../../components/dashboard/dashboardDensityPrimitives";

const DEFAULT_TENANT_ID = 1;

export default function AnalysisDashboard() {
  const [inventoryValue, setInventoryValue] = useState<number | null>(null);
  const [warehousesBreakdown, setWarehousesBreakdown] = useState<{ warehouse_id: number; value: number }[]>([]);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getTenantInventoryValue(DEFAULT_TENANT_ID, true),
      getSystemHealth().catch(() => ({ status: "error" })),
    ])
      .then(([inv, h]) => {
        if (cancelled) return;
        setInventoryValue(inv.total_inventory_value);
        setWarehousesBreakdown(inv.warehouses ?? []);
        setHealthStatus((h as { status: string }).status === "ok" ? "ok" : null);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Błąd połączenia z backendem");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="min-w-0">
        <p className="text-slate-500">Ładowanie…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-w-0">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800">
          <p className="font-medium">Błąd</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <p className="text-slate-600 mb-4">Przegląd wskaźników analitycznych (tenant {DEFAULT_TENANT_ID}).</p>
      <div className={`grid ${dashboardKpiGridGap} sm:grid-cols-2 lg:grid-cols-3`}>
        <div className={`${dashboardSurfaceCard} ${dashboardCardPadding}`}>
          <p className="text-xs font-medium uppercase text-slate-400">Wartość magazynowa (tenant)</p>
          <p className="mt-1 text-xl font-bold text-slate-800">
            {inventoryValue != null ? `${inventoryValue.toFixed(2)} zł` : "—"}
          </p>
        </div>
        <div className={`${dashboardSurfaceCard} ${dashboardCardPadding}`}>
          <p className="text-xs font-medium uppercase text-slate-400">Backend</p>
          <p className="mt-1 text-base font-semibold text-slate-800">
            {healthStatus === "ok" ? "Działa" : "—"}
          </p>
        </div>
      </div>
      {warehousesBreakdown.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Wartość per magazyn</h3>
          <ul className={`${dashboardSurfaceCard} divide-y divide-slate-100`}>
            {warehousesBreakdown.map((w) => (
              <li key={w.warehouse_id} className="px-3 py-1.5 flex justify-between text-sm">
                <span>Magazyn {w.warehouse_id}</span>
                <span className="font-medium">{w.value.toFixed(2)} zł</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
