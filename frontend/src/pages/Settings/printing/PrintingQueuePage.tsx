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
import { parsePrintJobError, printJobErrorSummary } from "./printingErrorPresentation";
import {
  PrintingAlert,
  PrintingDataTable,
  PrintingEmptyState,
  PrintingKpiGrid,
  PrintingLinkButton,
  PrintingLoadingState,
  PrintingPageBody,
  PrintingStatusBadge,
  PrintingTableBody,
  PrintingTableCell,
  PrintingTableHead,
  PrintingTableHeadCell,
  PrintingTableRow,
} from "./components/printingUi";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pl-PL");
}

function documentLabel(row: PrintJobRead): string {
  if (row.document_id != null) return `#${row.document_id}`;
  return row.document_type;
}

function countByStatus(rows: PrintJobRead[]) {
  const counts = { pending: 0, processing: 0, failed: 0, printed: 0 };
  for (const row of rows) {
    if (row.status in counts) counts[row.status as keyof typeof counts] += 1;
  }
  return counts;
}

type DetailModalProps = {
  job: PrintJobDetailRead | null;
  onClose: () => void;
};

function JobDetailModal({ job, onClose }: DetailModalProps) {
  if (!job) return null;

  const payload =
    typeof job.payload_json === "string" ? job.payload_json : JSON.stringify(job.payload_json, null, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Job #{job.id}</h3>
            <PrintingStatusBadge className={printJobStatusClass(job.status)}>
              {printJobStatusLabel(job.status)}
            </PrintingStatusBadge>
          </div>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
            Zamknij
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Dokument</dt>
            <dd>
              {job.document_type} {job.document_id != null ? `#${job.document_id}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Moduł / typ</dt>
            <dd>
              {job.source_module ?? "—"} / {job.job_type ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Drukarka</dt>
            <dd>{job.printer_name ?? `#${job.printer_id}`}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Agent</dt>
            <dd>
              {job.agent_name ?? "—"} ({job.machine_id ?? "—"})
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Utworzono</dt>
            <dd>{formatDate(job.created_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Start / koniec</dt>
            <dd>
              {formatDate(job.started_at)} / {formatDate(job.finished_at)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Czas trwania</dt>
            <dd>{formatDurationSeconds(job.duration_seconds)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Kopie / próby</dt>
            <dd>
              {job.copies} / {job.retry_count ?? 1}
            </dd>
          </div>
          {job.parent_job ? (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Job nadrzędny</dt>
              <dd>
                #{job.parent_job.id} ({printJobStatusLabel(job.parent_job.status)}, retry {job.parent_job.retry_number})
              </dd>
            </div>
          ) : null}
          {job.error_message ? (
            (() => {
              const err = parsePrintJobError(job.error_message);
              if (!err) return null;
              return (
                <div className="sm:col-span-2 space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-4">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-red-800">Przyjazny opis</dt>
                    <dd className="mt-1 text-sm font-medium text-red-900">{err.friendly}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">Błąd techniczny</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-slate-700">{err.technical}</dd>
                  </div>
                  {err.suggestion ? (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-orange-700">Sugestia naprawy</dt>
                      <dd className="mt-1 text-sm text-orange-900">{err.suggestion}</dd>
                    </div>
                  ) : null}
                </div>
              );
            })()
          ) : null}
        </dl>

        <div className="mt-4">
          <p className="mb-1 text-sm font-medium text-slate-700">Payload</p>
          <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            {payload}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function PrintingQueuePage() {
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = showWarehouseSelector ? activeWarehouse?.id ?? null : activeWarehouse?.id ?? null;
  const [rows, setRows] = useState<PrintJobRead[]>([]);
  const [statsRows, setStatsRows] = useState<PrintJobRead[]>([]);
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
      const [data, stats] = await Promise.all([
        fetchPrintJobs(DAMAGE_TENANT_ID, {
          warehouseId,
          status: statusFilter,
          q: search.trim() || undefined,
        }),
        fetchPrintJobs(DAMAGE_TENANT_ID, { warehouseId, status: "all", limit: 500 }),
      ]);
      setRows(data);
      setStatsRows(stats);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się pobrać kolejki wydruków."));
      setRows([]);
      setStatsRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, statusFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => countByStatus(statsRows), [statsRows]);

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
    <PrintingPageBody>
      <PrintingKpiGrid
        items={[
          { label: "Pending", value: kpis.pending, tone: "warning" },
          { label: "Processing", value: kpis.processing, tone: "primary" },
          { label: "Failed", value: kpis.failed, tone: "danger" },
          { label: "Printed", value: kpis.printed, tone: "success" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {PRINT_JOB_STATUS_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setStatusFilter(item.value)}
              className={
                statusFilter === item.value
                  ? "rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white shadow-sm"
                  : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-orange-200 hover:text-orange-700"
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
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 sm:max-w-xs"
        />
      </div>

      {error ? <PrintingAlert tone="error">{error}</PrintingAlert> : null}

      {loading ? (
        <PrintingLoadingState />
      ) : rows.length === 0 ? (
        <PrintingEmptyState>Brak jobów w kolejce.</PrintingEmptyState>
      ) : (
        <PrintingDataTable>
          <PrintingTableHead>
            <tr>
              <PrintingTableHeadCell>ID</PrintingTableHeadCell>
              <PrintingTableHeadCell>Utworzono</PrintingTableHeadCell>
              <PrintingTableHeadCell>Dokument</PrintingTableHeadCell>
              <PrintingTableHeadCell>Typ</PrintingTableHeadCell>
              <PrintingTableHeadCell>Drukarka</PrintingTableHeadCell>
              <PrintingTableHeadCell>Agent</PrintingTableHeadCell>
              <PrintingTableHeadCell>Status</PrintingTableHeadCell>
              <PrintingTableHeadCell>Start</PrintingTableHeadCell>
              <PrintingTableHeadCell>Koniec</PrintingTableHeadCell>
              <PrintingTableHeadCell>Czas</PrintingTableHeadCell>
              <PrintingTableHeadCell>Kopie</PrintingTableHeadCell>
              <PrintingTableHeadCell>Błąd</PrintingTableHeadCell>
              <PrintingTableHeadCell>Akcje</PrintingTableHeadCell>
            </tr>
          </PrintingTableHead>
          <PrintingTableBody>
            {rows.map((row) => (
              <PrintingTableRow key={row.id}>
                <PrintingTableCell className="font-mono text-xs">{row.id}</PrintingTableCell>
                <PrintingTableCell className="whitespace-nowrap">{formatDate(row.created_at)}</PrintingTableCell>
                <PrintingTableCell>{documentLabel(row)}</PrintingTableCell>
                <PrintingTableCell>{row.document_type}</PrintingTableCell>
                <PrintingTableCell>{row.printer_name ?? `#${row.printer_id}`}</PrintingTableCell>
                <PrintingTableCell>{row.agent_name ?? "—"}</PrintingTableCell>
                <PrintingTableCell>
                  <PrintingStatusBadge className={printJobStatusClass(row.status)}>
                    {printJobStatusLabel(row.status)}
                  </PrintingStatusBadge>
                </PrintingTableCell>
                <PrintingTableCell className="whitespace-nowrap">{formatDate(row.started_at)}</PrintingTableCell>
                <PrintingTableCell className="whitespace-nowrap">{formatDate(row.finished_at)}</PrintingTableCell>
                <PrintingTableCell>{formatDurationSeconds(row.duration_seconds)}</PrintingTableCell>
                <PrintingTableCell>{row.copies ?? 1}</PrintingTableCell>
                <PrintingTableCell className="max-w-[12rem] truncate text-red-600" title={row.error_message ?? undefined}>
                  {printJobErrorSummary(row.error_message)}
                </PrintingTableCell>
                <PrintingTableCell>
                  <div className="flex flex-wrap gap-2">
                    <PrintingLinkButton disabled={actionId === row.id} onClick={() => void openDetail(row.id)}>
                      Szczegóły
                    </PrintingLinkButton>
                    {canRetryJob(row.status) ? (
                      <PrintingLinkButton disabled={actionId === row.id} onClick={() => void runAction(row.id, "retry")}>
                        Ponów
                      </PrintingLinkButton>
                    ) : null}
                    {canCancelJob(row.status) ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-orange-700 underline-offset-2 hover:underline disabled:opacity-50"
                        disabled={actionId === row.id}
                        onClick={() => void runAction(row.id, "cancel")}
                      >
                        Anuluj
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600 underline-offset-2 hover:underline disabled:opacity-50"
                      disabled={actionId === row.id}
                      onClick={() => void runAction(row.id, "delete")}
                    >
                      Usuń
                    </button>
                  </div>
                </PrintingTableCell>
              </PrintingTableRow>
            ))}
          </PrintingTableBody>
        </PrintingDataTable>
      )}

      <JobDetailModal job={detailJob} onClose={() => setDetailJob(null)} />
    </PrintingPageBody>
  );
}
