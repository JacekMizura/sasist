import { useEffect, useState } from "react";
import { getProductPairs, type ProductPairItem } from "../../api/analysisApi";

const DEFAULT_TENANT_ID = 1;

export default function ProductPairsPage() {
  const [items, setItems] = useState<ProductPairItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getProductPairs(DEFAULT_TENANT_ID)
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
      <h1 className="text-xl font-semibold text-slate-800">Produkty kupowane razem</h1>
      <p className="mt-2 text-slate-600 mb-4">
        Pary produktów często zamawianych w tym samym zamówieniu (order_items).
      </p>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Produkt A</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Produkt B</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Częstotliwość</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">Brak danych.</td></tr>
            ) : (
              items.map((row, i) => (
                <tr key={`${row.product_id_a}-${row.product_id_b}-${i}`}>
                  <td className="px-4 py-2">{row.product_name_a ?? row.product_id_a}</td>
                  <td className="px-4 py-2">{row.product_name_b ?? row.product_id_b}</td>
                  <td className="px-4 py-2 text-right">{row.frequency}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
