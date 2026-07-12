import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, X } from "lucide-react";
import toast from "react-hot-toast";

import { fetchAgentDiagnostics } from "../../../api/printingApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import type { PrinterAgentDiagnosticsRead, PrinterAgentRead } from "../../../types/printing";
import { PrintingLinkButton } from "./components/printingUi";

type Props = {
  open: boolean;
  agent: PrinterAgentRead | null;
  tenantId: number;
  onClose: () => void;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pl-PL");
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-orange-50 py-2 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export default function AgentDiagnosticsModal({ open, agent, tenantId, onClose }: Props) {
  const [data, setData] = useState<PrinterAgentDiagnosticsRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedMachineId, setCopiedMachineId] = useState(false);

  const load = useCallback(async () => {
    if (!agent) return;
    setLoading(true);
    setError(null);
    try {
      const diagnostics = await fetchAgentDiagnostics(tenantId, agent.id);
      setData(diagnostics);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się pobrać diagnostyki agenta."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [agent, tenantId]);

  useEffect(() => {
    if (open && agent) {
      void load();
    } else {
      setData(null);
      setError(null);
      setCopiedMachineId(false);
    }
  }, [open, agent, load]);

  if (!open || !agent) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-orange-100 bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Diagnostyka agenta</h3>
            <p className="text-sm text-slate-600">{agent.name}</p>
          </div>
          <button type="button" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-[#FFF7ED] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-orange-100"
            onClick={() =>
              void copyText(agent.machine_id).then((ok) => {
                if (ok) {
                  toast.success("Skopiowano identyfikator maszyny");
                  setCopiedMachineId(true);
                  window.setTimeout(() => setCopiedMachineId(false), 2000);
                } else {
                  toast.error("Kopiowanie nie powiodło się");
                }
              })
            }
          >
            <Copy className="h-3.5 w-3.5" />
            {copiedMachineId ? "Skopiowano" : "Kopiuj identyfikator"}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-orange-50"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Odśwież
          </button>
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}

        {loading && !data ? (
          <p className="text-sm text-slate-600">Ładowanie diagnostyki…</p>
        ) : data ? (
          <div className="rounded-xl border border-orange-100 bg-[#FFF7ED] p-4">
            <Row label="Wersja agenta" value={data.version ?? "—"} />
            <Row label="Dostępna wersja" value={data.latest_version ?? "—"} />
            <Row label="Wersja w konfiguracji" value={data.config_version ?? "—"} />
            <Row label="Identyfikator maszyny" value={data.machine_id} />
            <Row label="Magazyn" value={data.warehouse_id != null ? String(data.warehouse_id) : "—"} />
            <Row label="Drukarki" value={String(data.printer_count)} />
            <Row label="Ostatnia sygnatura życia" value={formatDate(data.last_heartbeat)} />
            <Row label="Ostatnie odpytywanie" value={formatDate(data.last_poll)} />
            <Row
              label="Aktualizacja"
              value={data.update_available ? "Dostępna aktualizacja" : "Brak aktualizacji"}
            />
          </div>
        ) : null}

        <p className="mt-3 text-xs text-slate-500">
          Endpoint gotowy pod przyszłe zdalne zarządzanie agentami (restart, synchronizacja).
        </p>
      </div>
    </div>
  );
}

export function AgentActionsCell({
  busy,
  onDiagnostics,
  onSync,
  onRestart,
  onCopyMachineId,
  onTestPage,
}: {
  busy: boolean;
  onDiagnostics: () => void;
  onSync: () => void;
  onRestart: () => void;
  onCopyMachineId: () => void;
  onTestPage: () => void;
}) {
  return (
    <div className="flex min-w-[200px] flex-col gap-1">
      <PrintingLinkButton disabled={busy} onClick={onCopyMachineId}>
        Kopiuj identyfikator maszyny
      </PrintingLinkButton>
      <PrintingLinkButton disabled={busy} onClick={onDiagnostics}>
        Otwórz diagnostykę
      </PrintingLinkButton>
      <PrintingLinkButton disabled={busy} onClick={onSync}>
        Synchronizuj drukarki
      </PrintingLinkButton>
      <PrintingLinkButton disabled={busy} onClick={onRestart}>
        Restart agenta
      </PrintingLinkButton>
      <PrintingLinkButton disabled={busy} onClick={onTestPage}>
        Strona testowa
      </PrintingLinkButton>
    </div>
  );
}
