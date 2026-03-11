import { useEffect, useState } from "react";
import { getHotLocations, type HotLocationItem } from "../../api/analysisApi";

const DEFAULT_TENANT_ID = 1;

export default function PickHeatmapPage() {
  const [items, setItems] = useState<HotLocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getHotLocations(DEFAULT_TENANT_ID)
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
      <h1 className="text-xl font-semibold text-slate-800">Gorące lokalizacje</h1>
      <p className="mt-2 text-slate-600 mb-4">
        Suma skompletowanych ilości (picks) per lokalizacja oraz aktualny stan magazynowy.
      </p>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-slate-600">ID</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Lokalizacja</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Składane (picks)</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Stan na magazynie</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Brak danych (brak pików dla wybranego magazynu).</td></tr>
            ) : (
              items.map((row) => (
                <tr key={row.location_id}>
                  <td className="px-4 py-2">{row.location_id}</td>
                  <td className="px-4 py-2">{row.location_name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{row.total_quantity}</td>
                  <td className="px-4 py-2 text-right">{row.current_stock ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
