import { useCallback, useEffect, useState } from "react";
import { Clock, Printer } from "lucide-react";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { fetchPrintJobs } from "../../../api/printingApi";
import type { PrintJobRead } from "../../../types/printing";
import {
  formatDurationSeconds,
  printJobStatusClass,
  printJobStatusLabel,
} from "../../../printing/presentation/printingQueuePresentation";
import { wmsSettingsTokens } from "../wmsSettingsTokens";
import { WmsSettingsSection } from "../WmsSettingsSection";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import {
  WorkstationEmptyState,
  WorkstationErrorState,
  WorkstationTabShell,
  wsTokens,
} from "./workstationUi";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pl-PL");
}

/** Workstation history = PrintJob rows for this workstation (SSOT queue). */
export function HistoryTab({ workstationId }: { workstationId: number }) {
  const [items, setItems] = useState<PrintJobRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchPrintJobs(WMS_WORKSTATIONS_TENANT_ID, {
        workstationId,
        limit: 100,
      });
      setItems(rows);
    } catch (e) {
      setError(extractApiErrorMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [workstationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && items.length === 0) {
    return (
      <WorkstationTabShell>
        <WorkstationErrorState message={error} onRetry={() => void load()} />
      </WorkstationTabShell>
    );
  }
  if (loading && items.length === 0) {
    return (
      <WorkstationTabShell>
        <p className="text-sm text-slate-500">Ładowanie…</p>
      </WorkstationTabShell>
    );
  }
  if (items.length === 0) {
    return (
      <WorkstationTabShell
        actions={
          <button type="button" className={wsTokens.mutedBtn} onClick={() => void load()}>
            Odśwież
          </button>
        }
      >
        <WorkstationEmptyState
          title="Brak wydruków"
          description="Zadania kolejki (w tym wydruk testowy) pojawią się tutaj po wysłaniu na Agenta."
        />
      </WorkstationTabShell>
    );
  }

  return (
    <WorkstationTabShell
      intro="Kolejka wydruków tego stanowiska (PrintJob)."
      actions={
        <button type="button" className={wsTokens.mutedBtn} onClick={() => void load()}>
          Odśwież
        </button>
      }
    >
      <WmsSettingsSection id="ws-print-history" title="Historia wydruków">
        <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
          {items.map((job) => (
            <li key={job.id} className="relative">
              <span className="absolute -left-[1.9rem] top-3 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm">
                <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </span>
              <article className={wmsSettingsTokens.cardInner}>
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {formatDate(job.finished_at ?? job.created_at)}
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${printJobStatusClass(job.status)}`}
                  >
                    {printJobStatusLabel(job.status)}
                  </span>
                </div>
                <h4 className="mt-2 text-sm font-semibold text-slate-900">
                  {job.document_type === "test_page"
                    ? "Wydruk testowy"
                    : job.document_type.replace(/_/g, " ")}{" "}
                  <span className="font-normal text-slate-500">#{job.id}</span>
                </h4>
                <p className="mt-1 text-sm text-slate-600">
                  {job.printer_name ?? `Drukarka #${job.printer_id}`}
                  {job.agent_name || job.machine_id
                    ? ` · ${job.agent_name ?? job.machine_id}`
                    : ""}
                  {" · "}
                  {formatDurationSeconds(job.duration_seconds)}
                </p>
                {job.error_message ? (
                  <p className="mt-1 text-sm text-red-600">{job.error_message}</p>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      </WmsSettingsSection>
    </WorkstationTabShell>
  );
}
