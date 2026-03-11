import { useEffect, useState } from "react";
import { getTenantInventoryValue } from "../../api/analysisApi";
import api from "../../api/axios";

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
        if (!cancelled) setError(e?.message ?? "Błąd połączenia z backendem");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-6"><p className="text-slate-500">Ładowanie…</p></div>;
  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800">
          <p className="font-medium">Błąd</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const nameById = Object.fromEntries(warehouses.map((w) => [w.id, w.name ?? `Magazyn ${w.id}`]));

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Wartość magazynowa</h2>
      <p className="text-slate-600 mb-6">Wartość zapasów (tenant {DEFAULT_TENANT_ID}) – suma quantity × purchase_price.</p>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm mb-6 max-w-md">
        <p className="text-xs font-medium uppercase text-slate-400">Łączna wartość</p>
        <p className="text-3xl font-bold text-slate-800 mt-1">
          {total != null ? `${total.toFixed(2)} zł` : "—"}
        </p>
      </div>
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Per magazyn</h3>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Magazyn</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Wartość (zł)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {warehousesBreakdown.map((w) => (
              <tr key={w.warehouse_id}>
                <td className="px-4 py-2">{nameById[w.warehouse_id] ?? `ID ${w.warehouse_id}`}</td>
                <td className="px-4 py-2 text-right font-medium">{w.value.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
