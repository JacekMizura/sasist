import { useEffect, useState } from "react";
import { getPickDensity } from "../../api/analysisApi";

const DEFAULT_TENANT_ID = 1;

export default function PickDensityPage() {
  const [items, setItems] = useState<{ location_id: number; location_name?: string; total_quantity: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPickDensity(DEFAULT_TENANT_ID)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Błąd ładowania");
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

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Gęstość kompletacji</h2>
      <p className="text-slate-600 mb-4">
        Suma ilości z zamówień (order_items) pogrupowana po lokalizacji (przypisanie produktu do lokalizacji z inventory).
      </p>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-slate-600">ID lokalizacji</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Nazwa</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Łączna ilość</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">Brak danych (zamówienia lub inventory).</td></tr>
            ) : (
              items.map((row) => (
                <tr key={row.location_id}>
                  <td className="px-4 py-2">{row.location_id}</td>
                  <td className="px-4 py-2">{row.location_name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{row.total_quantity}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
