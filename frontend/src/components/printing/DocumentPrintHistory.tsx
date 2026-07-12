import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";

import {
  fetchPrintJobsByDocument,
  retryPrintJob,
} from "../../api/printingApi";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import type { PrintJobRead } from "../../types/printing";
import {
  formatDurationSeconds,
  printJobStatusClass,
  printJobStatusLabel,
} from "../../pages/Settings/printing/printingQueuePresentation";

type Props = {
  tenantId: number;
  documentType: "stock_document" | "sale_document";
  documentId: number;
  warehouseId?: number | null;
  onRetrySuccess?: () => void;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pl-PL");
}

export default function DocumentPrintHistory({
  tenantId,
  documentType,
  documentId,
  warehouseId,
  onRetrySuccess,
}: Props) {
  const [rows, setRows] = useState<PrintJobRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPrintJobsByDocument(tenantId, {
        documentType,
        documentId,
        warehouseId,
      });
      setRows(data);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się pobrać historii wydruków."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, documentType, documentId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lastPrinted = rows.find((row) => row.status === "printed");

  const handleRetry = async (jobId: number) => {
    setActionId(jobId);
    try {
      await retryPrintJob(tenantId, jobId);
      await load();
      onRetrySuccess?.();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się ponowić wydruku."));
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Historia wydruków…</p>;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Historia wydruków</h3>
        {lastPrinted ? (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
            ✓ Wydrukowano {formatDate(lastPrinted.finished_at ?? lastPrinted.created_at)}
          </span>
        ) : (
          <span className="text-sm text-slate-500">Brak udanego wydruku</span>
        )}
      </div>

      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Ten dokument nie był jeszcze drukowany przez agenta Sasist.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Status</th>
                <th className="py-1 pr-3 font-medium">Data</th>
                <th className="py-1 pr-3 font-medium">Drukarka</th>
                <th className="py-1 pr-3 font-medium">Komputer</th>
                <th className="py-1 pr-3 font-medium">Kopie</th>
                <th className="py-1 pr-3 font-medium">Czas</th>
                <th className="py-1 font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${printJobStatusClass(row.status)}`}>
                      {printJobStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDate(row.finished_at ?? row.created_at)}</td>
                  <td className="py-2 pr-3">{row.printer_name ?? `#${row.printer_id}`}</td>
                  <td className="py-2 pr-3">{row.agent_name ?? row.machine_id ?? "—"}</td>
                  <td className="py-2 pr-3">{row.copies ?? 1}</td>
                  <td className="py-2 pr-3">{formatDurationSeconds(row.duration_seconds)}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/settings/printers/queue?job=${row.id}`}
                        className="text-xs text-slate-700 underline"
                      >
                        Szczegóły
                      </Link>
                      <button
                        type="button"
                        className="text-xs text-blue-700 underline disabled:opacity-50"
                        disabled={actionId === row.id}
                        onClick={() => void handleRetry(row.id)}
                      >
                        Ponów wydruk
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
