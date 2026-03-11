import { useEffect, useState } from "react";
import { getDbSize } from "../../api/systemApi";

export default function SystemDbSize() {
  const [data, setData] = useState<{ sizeMb: number; tablesCount: number; totalRows: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDbSize()
      .then((d) => {
        if (cancelled) return;
        const sizeMb = d.database_size_mb ?? d.size_mb ?? 0;
        setData({
          sizeMb,
          tablesCount: d.tables_count ?? 0,
          totalRows: d.total_rows ?? 0,
        });
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

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Rozmiar bazy danych</h2>
      <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-400">Rozmiar bazy</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {data != null ? `${data.sizeMb} MB` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-400">Liczba tabel</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {data?.tablesCount ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-400">Liczba wierszy</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {data?.totalRows ?? "—"}
          </p>
        </div>
      </div>
      <p className="text-sm text-slate-500 mt-4">Plik bazy SQLite (test.db).</p>
    </div>
  );
}
