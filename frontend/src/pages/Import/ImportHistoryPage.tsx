import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";

export type ImportLogRow = {
  id: number;
  type: string;
  tenant_id: number | null;
  warehouse_id: number | null;
  total_rows: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: number;
  errors: number;
  message: string | null;
  created_at: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pl-PL", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function typeLabel(type: string): string {
  if (type === "products") return "Produkty";
  if (type === "orders") return "Zamówienia";
  return type;
}

export default function ImportHistoryPage() {
  const [logs, setLogs] = useState<ImportLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<ImportLogRow[]>("/import/logs/", { params: { limit: 100 } })
      .then((res) => {
        if (!cancelled) setLogs(Array.isArray(res.data) ? res.data : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.response?.data?.detail?.message || e?.message || "Błąd ładowania");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Historia importów</h1>
            <p className="text-sm text-slate-500 mt-1">Ostatnie importy CSV (produkty i zamówienia)</p>
          </div>
          <Link
            to="/products/import"
            className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700"
          >
            ← Powrót do importu
          </Link>
        </div>

        {loading && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center text-slate-500">
            Ładowanie…
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
            {error}
          </div>
        )}
        {!loading && !error && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Data</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Typ</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-700">Utworzono</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-700">Zaktualizowano</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-700">Ostrzeżenia</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-700">Błędy</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        Brak zapisów importów.
                      </td>
                    </tr>
                  ) : (
                    logs.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedMessage(row.message ?? null)}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="px-4 py-3 text-slate-700">{formatDate(row.created_at)}</td>
                        <td className="px-4 py-3 text-slate-700">{typeLabel(row.type)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{row.created}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{row.updated}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={row.warnings > 0 ? "text-amber-600 font-medium" : "text-slate-600"}>
                            {row.warnings}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={row.errors > 0 ? "text-red-600 font-medium" : "text-slate-600"}>
                            {row.errors}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedMessage !== null && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedMessage(null)}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5 max-h-[80vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-slate-800 mb-2">Szczegóły</h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedMessage || "—"}</p>
              <button
                type="button"
                className="mt-4 px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300"
                onClick={() => setSelectedMessage(null)}
              >
                Zamknij
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
