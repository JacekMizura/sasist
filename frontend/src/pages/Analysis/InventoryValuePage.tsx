import { useEffect, useState } from "react";
import { getTenantInventoryValue } from "../../api/analysisApi";
import api from "../../api/axios";
import { AnalysisDecisionHeader } from "../../modules/analytics/AnalysisDecisionHeader";
import { analizyKpiCardClass } from "../../modules/analizy/analizyUi";

const DEFAULT_TENANT_ID = 1;

type Warehouse = { id: number; name: string };

export default function InventoryValuePage() {
  const [total, setTotal] = useState<number | null>(null);
  const [warehousesBreakdown, setWarehousesBreakdown] = useState<{ warehouse_id: number; value: number }[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get<Warehouse[]>("/warehouses/").then((r) => setWarehouses(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    getTenantInventoryValue(DEFAULT_TENANT_ID, true)
      .then((data) => {
        if (cancelled) return;
        setTotal(data.total_inventory_value);
        setWarehousesBreakdown(data.warehouses ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Błąd połączenia z systemem");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const nameById = Object.fromEntries(warehouses.map((w) => [w.id, w.name ?? `Magazyn ${w.id}`]));

  return (
    <div className="min-w-0">
      <AnalysisDecisionHeader
        title="Wartość zapasów"
        question="Ile kapitału wisi w magazynie?"
        decision="Gdzie szukać redukcji zamrożonego kapitału?"
        actions={[
          { label: "Znajdź towar bez rotacji", to: "/analytics/dead-stock", primary: true },
          { label: "Utwórz listę zakupów", to: "/purchasing/plan" },
        ]}
      />
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-medium">Błąd</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : (
        <>
          <div className={`${analizyKpiCardClass} mb-6 max-w-md`}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Łączna wartość</p>
            <p className="mt-1 text-3xl font-bold text-slate-800">
              {total != null ? `${total.toFixed(2)} zł` : "—"}
            </p>
          </div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Według magazynu</h3>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-600">Magazyn</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-600">Wartość (zł)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {warehousesBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-slate-500">
                      Brak danych o wartości zapasów w magazynach.
                    </td>
                  </tr>
                ) : (
                  warehousesBreakdown.map((w) => (
                    <tr key={w.warehouse_id}>
                      <td className="px-4 py-2">{nameById[w.warehouse_id] ?? `ID ${w.warehouse_id}`}</td>
                      <td className="px-4 py-2 text-right font-medium">{w.value.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
