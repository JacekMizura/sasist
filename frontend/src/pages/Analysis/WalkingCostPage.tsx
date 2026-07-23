import { useEffect, useState } from "react";
import { getWalkingCost, type WalkingCostItem } from "../../api/analysisApi";

const DEFAULT_TENANT_ID = 1;

export default function WalkingCostPage() {
  const [items, setItems] = useState<WalkingCostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getWalkingCost(DEFAULT_TENANT_ID)
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

  if (loading) return <div className="min-w-0"><p className="text-slate-500">Ładowanie…</p></div>;
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
      <h1 className="text-xl font-semibold text-slate-800">Koszt chodzenia</h1>
      <p className="mt-2 text-slate-600 mb-4">
        Dystans przejścia per zamówienie (graf magazynu, dane zamówień). Start → lokalizacje produktów. Nie używa picków.
      </p>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-slate-600">ID zamówienia</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Numer</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Dystans (m)</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Lokalizacje</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Sztuk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Brak danych. Skonfiguruj sieć tras w projektancie (TRASY) i upewnij się, że zamówienia mają produkty w inwentarzu oraz Access Points.</td></tr>
            ) : (
              items.map((row) => (
                <tr key={row.order_id}>
                  <td className="px-4 py-2">{row.order_id}</td>
                  <td className="px-4 py-2">{row.order_number ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{row.total_distance == null ? "N/A" : row.total_distance}</td>
                  <td className="px-4 py-2 text-right">{row.distinct_locations_count}</td>
                  <td className="px-4 py-2 text-right">{row.total_items}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
