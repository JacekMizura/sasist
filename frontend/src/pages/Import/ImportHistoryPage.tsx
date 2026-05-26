import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import { entityTypeLabelPl } from "../../utils/exportImportLabelsPl";

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
  return entityTypeLabelPl(type);
}

function getImportStatus(row: ImportLogRow): {
  label: string;
  className: string;
} {
  if (row.errors > 0 && row.created === 0 && row.updated === 0) {
    return { label: "Błąd", className: "border-red-200 bg-red-50 text-red-700" };
  }
  if (row.errors > 0 || row.skipped > 0) {
    return { label: "Częściowy", className: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  if (row.warnings > 0) {
    return { label: "Z ostrzeżeniami", className: "border-yellow-200 bg-yellow-50 text-yellow-700" };
  }
  return { label: "Sukces", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

export type ImportHistoryPageProps = {
  /** Filtr typu importu (API query `type`). */
  typeFilter?: "products" | "orders" | "sets";
  backTo?: string;
  backLabel?: string;
  /** Osadzenie pod Ustawienia → Import (nagłówek strony jest u rodzica). */
  embedded?: boolean;
};

export default function ImportHistoryPage({
  typeFilter,
  backTo = "/settings/import",
  backLabel = "← Powrót do importu",
  embedded = false,
}: ImportHistoryPageProps = {}) {
  const [logs, setLogs] = useState<ImportLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<ImportLogRow[]>("/import/logs/", { params: { limit: 100, ...(typeFilter ? { type: typeFilter } : {}) } })
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
  }, [typeFilter]);

  return (
    <div className={embedded ? "min-w-0 space-y-4" : "min-h-screen bg-slate-50 p-4"}>
      <div className={embedded ? "w-full space-y-4" : "mx-auto w-full max-w-[1500px] space-y-4"}>
        {!embedded ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Historia importów</h1>
              <p className="mt-1 text-sm text-slate-500">Ostatnie importy CSV (wszystkie typy encji)</p>
            </div>
            <Link to={backTo} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              {backLabel}
            </Link>
          </div>
        ) : (
          <div className="flex justify-end">
            <Link
              to={backTo}
              className="text-sm font-semibold text-cyan-700 hover:text-cyan-900 hover:underline"
            >
              {backLabel}
            </Link>
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Ładowanie…
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}
        {!loading && !error && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5">
            <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Dziennik importów</h2>
              <p className="mt-0.5 text-xs text-slate-500">Kliknij wiersz, aby zobaczyć komunikat operacji.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Data</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Typ</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Utworzono</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Zaktualizowano</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Ostrzeżenia</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Błędy</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        Brak zapisów importów.
                      </td>
                    </tr>
                  ) : (
                    logs.map((row) => {
                      const status = getImportStatus(row);
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedMessage(row.message ?? null)}
                          className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/90"
                        >
                          <td className="whitespace-nowrap px-4 py-2 text-slate-800">{formatDate(row.created_at)}</td>
                          <td className="px-4 py-2 text-slate-700">{typeLabel(row.type)}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-700">{row.created}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-700">{row.updated}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            <span className={row.warnings > 0 ? "inline-flex rounded-md bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700" : "text-slate-600"}>
                              {row.warnings}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            <span className={row.errors > 0 ? "inline-flex rounded-md bg-red-50 px-1.5 py-0.5 font-medium text-red-700" : "text-slate-600"}>
                              {row.errors}
                            </span>
                          </td>
                        </tr>
                      );
                    })
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
