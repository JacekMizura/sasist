import { useCallback, useEffect, useMemo, useState } from "react";

import {
  cancelPrintJob,
  deletePrintJob,
  fetchPrintJob,
  fetchPrintJobs,
  retryPrintJob,
} from "../../../api/printingApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { useWarehouse } from "../../../context/WarehouseContext";
import type { PrintJobDetailRead, PrintJobRead } from "../../../types/printing";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import {
  PRINT_JOB_STATUS_FILTERS,
  canCancelJob,
  canRetryJob,
  formatDurationSeconds,
  printJobStatusClass,
  printJobStatusLabel,
  type PrintJobStatusFilter,
} from "./printingQueuePresentation";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pl-PL");
}

function documentLabel(row: PrintJobRead): string {
  if (row.document_id != null) return `#${row.document_id}`;
  return row.document_type;
}

type DetailModalProps = {
  job: PrintJobDetailRead | null;
  onClose: () => void;
};

function JobDetailModal({ job, onClose }: DetailModalProps) {
  if (!job) return null;

  const payload =
    typeof job.payload_json === "string"
      ? job.payload_json
      : JSON.stringify(job.payload_json, null, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Job #{job.id}</h3>
            <p className="text-sm text-slate-500">{printJobStatusLabel(job.status)}</p>
          </div>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
            Zamknij
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Dokument</dt>
            <dd>{job.document_type} {job.document_id != null ? `#${job.document_id}` : ""}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Moduł / typ</dt>
            <dd>{job.source_module ?? "—"} / {job.job_type ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Drukarka</dt>
            <dd>{job.printer_name ?? `#${job.printer_id}`}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Agent</dt>
            <dd>{job.agent_name ?? "—"} ({job.machine_id ?? "—"})</dd>
          </div>
          <div>
            <dt className="text-slate-500">Utworzono</dt>
            <dd>{formatDate(job.created_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Start / koniec</dt>
            <dd>{formatDate(job.started_at)} / {formatDate(job.finished_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Czas trwania</dt>
            <dd>{formatDurationSeconds(job.duration_seconds)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Kopie / próby</dt>
            <dd>{job.copies} / {job.retry_count ?? 1}</dd>
          </div>
          {job.parent_job ? (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Job nadrzędny</dt>
              <dd>#{job.parent_job.id} ({printJobStatusLabel(job.parent_job.status)}, retry {job.parent_job.retry_number})</dd>
            </div>
          ) : null}
          {job.error_message ? (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Błąd</dt>
              <dd className="text-red-600">{job.error_message}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-4">
          <p className="mb-1 text-sm font-medium text-slate-700">Payload</p>
          <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs">{payload}</pre>
        </div>
      </div>
    </div>
  );
}

export default function PrintingQueuePage() {
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = showWarehouseSelector ? activeWarehouse?.id ?? null : activeWarehouse?.id ?? null;
  const [rows, setRows] = useState<PrintJobRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PrintJobStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [detailJob, setDetailJob] = useState<PrintJobDetailRead | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPrintJobs(DAMAGE_TENANT_ID, {
        warehouseId,
        status: statusFilter,
        q: search.trim() || undefined,
      });
      setRows(data);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się pobrać kolejki wydruków."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, statusFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => rows, [rows]);

  const openDetail = async (jobId: number) => {
    setActionId(jobId);
    try {
      const detail = await fetchPrintJob(DAMAGE_TENANT_ID, jobId);
      setDetailJob(detail);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się pobrać szczegółów joba."));
    } finally {
      setActionId(null);
    }
  };

  const runAction = async (jobId: number, action: "retry" | "cancel" | "delete") => {
    setActionId(jobId);
    setError(null);
    try {
      if (action === "retry") await retryPrintJob(DAMAGE_TENANT_ID, jobId);
      if (action === "cancel") await cancelPrintJob(DAMAGE_TENANT_ID, jobId);
      if (action === "delete") await deletePrintJob(DAMAGE_TENANT_ID, jobId);
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Operacja nie powiodła się."));
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="mt-4 min-w-0">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {PRINT_JOB_STATUS_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setStatusFilter(item.value)}
              className={
                statusFilter === item.value
                  ? "rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              }
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj: ID joba, dokument, drukarka…"
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm sm:max-w-xs"
        />
      </div>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-slate-500">Brak jobów w kolejce.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Utworzono</th>
                <th className="px-3 py-2 font-medium">Dokument</th>
                <th className="px-3 py-2 font-medium">Typ</th>
                <th className="px-3 py-2 font-medium">Drukarka</th>
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Start</th>
                <th className="px-3 py-2 font-medium">Koniec</th>
                <th className="px-3 py-2 font-medium">Czas</th>
                <th className="px-3 py-2 font-medium">Kopie</th>
                <th className="px-3 py-2 font-medium">Błąd</th>
                <th className="px-3 py-2 font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.created_at)}</td>
                  <td className="px-3 py-2">{documentLabel(row)}</td>
                  <td className="px-3 py-2">{row.document_type}</td>
                  <td className="px-3 py-2">{row.printer_name ?? `#${row.printer_id}`}</td>
                  <td className="px-3 py-2">{row.agent_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${printJobStatusClass(row.status)}`}>
                      {printJobStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.started_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.finished_at)}</td>
                  <td className="px-3 py-2">{formatDurationSeconds(row.duration_seconds)}</td>
                  <td className="px-3 py-2">{row.copies ?? 1}</td>
                  <td className="max-w-[12rem] truncate px-3 py-2 text-red-600" title={row.error_message ?? undefined}>
                    {row.error_message ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="text-xs text-slate-700 underline"
                        disabled={actionId === row.id}
                        onClick={() => void openDetail(row.id)}
                      >
                        Szczegóły
                      </button>
                      {canRetryJob(row.status) ? (
                        <button
                          type="button"
                          className="text-xs text-blue-700 underline"
                          disabled={actionId === row.id}
                          onClick={() => void runAction(row.id, "retry")}
                        >
                          Ponów
                        </button>
                      ) : null}
                      {canCancelJob(row.status) ? (
                        <button
                          type="button"
                          className="text-xs text-orange-700 underline"
                          disabled={actionId === row.id}
                          onClick={() => void runAction(row.id, "cancel")}
                        >
                          Anuluj
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-xs text-red-700 underline"
                        disabled={actionId === row.id}
                        onClick={() => void runAction(row.id, "delete")}
                      >
                        Usuń
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <JobDetailModal job={detailJob} onClose={() => setDetailJob(null)} />
    </div>
  );
}
