import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  fetchPrinterAgentDownloadInfo,
  fetchPrintingAgents,
  fetchPrintJobs,
  requestAgentPrinterSync,
  requestAgentRestart,
  sendAgentTestPage,
} from "../../../api/printingApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import {
  openPrinterAgentDownload,
  resolvePrinterAgentDownload,
} from "../../../config/printerAgent";
import { useWarehouse } from "../../../context/WarehouseContext";
import type { PrinterAgentDownloadInfo, PrinterAgentRead } from "../../../types/printing";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { agentHealthClass, agentHealthLabel } from "./printingQueuePresentation";
import {
  agentVersionBadgeClass,
  agentVersionBadgeLabel,
  compareAgentVersions,
} from "./agentVersionPresentation";
import AddComputerModal from "./AddComputerModal";
import AgentDiagnosticsModal, { AgentActionsCell } from "./AgentDiagnosticsModal";
import {
  PrintingAlert,
  PrintingDataTable,
  PrintingEmptyState,
  PrintingKpiGrid,
  PrintingLinkButton,
  PrintingLoadingState,
  PrintingPageBody,
  PrintingPrimaryButton,
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

export default function PrintingAgentsPage() {
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = showWarehouseSelector ? activeWarehouse?.id ?? null : activeWarehouse?.id ?? null;
  const [rows, setRows] = useState<PrinterAgentRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [addComputerOpen, setAddComputerOpen] = useState(false);
  const [pendingJobs, setPendingJobs] = useState(0);
  const [downloadInfo, setDownloadInfo] = useState<PrinterAgentDownloadInfo | null>(null);
  const [diagnosticsAgent, setDiagnosticsAgent] = useState<PrinterAgentRead | null>(null);

  const latestReleaseVersion = downloadInfo?.latest_version ?? null;
  const resolvedDownload = useMemo(() => resolvePrinterAgentDownload(downloadInfo), [downloadInfo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, pending, download] = await Promise.all([
        fetchPrintingAgents(DAMAGE_TENANT_ID, warehouseId),
        fetchPrintJobs(DAMAGE_TENANT_ID, { warehouseId, status: "pending", limit: 500 }),
        fetchPrinterAgentDownloadInfo(DAMAGE_TENANT_ID).catch(() => null),
      ]);
      setRows(data);
      setPendingJobs(pending.length);
      if (download) setDownloadInfo(download);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się pobrać agentów."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    let online = 0;
    let offline = 0;
    let printers = 0;
    for (const row of rows) {
      const health = row.health_status ?? (row.is_online ? "online" : "offline");
      if (health === "online") online += 1;
      else offline += 1;
      printers += row.printer_count ?? 0;
    }
    return { online, offline, printers, pending: pendingJobs };
  }, [rows, pendingJobs]);

  const runTestPage = async (agentId: number) => {
    setActionId(agentId);
    setError(null);
    setSuccess(null);
    try {
      const job = await sendAgentTestPage(DAMAGE_TENANT_ID, agentId);
      setSuccess(`Wysłano stronę testową (job #${job.id}).`);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się wysłać strony testowej."));
    } finally {
      setActionId(null);
    }
  };

  const handleUpdateAgent = () => {
    const url = resolvedDownload.downloadUrl;
    if (!url) {
      setError("Brak adresu instalatora aktualizacji.");
      return;
    }
    openPrinterAgentDownload(url);
  };

  const copyMachineId = async (machineId: string) => {
    try {
      await navigator.clipboard.writeText(machineId);
      toast.success("Skopiowano Machine ID");
    } catch {
      toast.error("Kopiowanie nie powiodło się");
    }
  };

  const runAgentSync = async (agentId: number) => {
    setActionId(agentId);
    setError(null);
    try {
      await requestAgentPrinterSync(DAMAGE_TENANT_ID, agentId);
      toast.success("Zsynchronizowano drukarki agenta.");
      void load();
    } catch (err) {
      const message = extractApiErrorMessage(err, "Synchronizacja nie powiodła się.");
      toast.error(message);
    } finally {
      setActionId(null);
    }
  };

  const runAgentRestart = async (agentId: number) => {
    setActionId(agentId);
    try {
      await requestAgentRestart(DAMAGE_TENANT_ID, agentId);
      toast.success("Zrestartowano agenta.");
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Restart agenta nie jest jeszcze dostępny."));
    } finally {
      setActionId(null);
    }
  };

  return (
    <PrintingPageBody>
      <div className="flex justify-end">
        <PrintingPrimaryButton onClick={() => setAddComputerOpen(true)}>Dodaj komputer</PrintingPrimaryButton>
      </div>

      <PrintingKpiGrid
        items={[
          { label: "Online", value: kpis.online, tone: "success" },
          { label: "Offline", value: kpis.offline, tone: "danger" },
          { label: "Drukarki", value: kpis.printers, tone: "primary" },
          { label: "Oczekujące zadania", value: kpis.pending, tone: "warning" },
        ]}
      />

      {latestReleaseVersion ? (
        <p className="text-sm text-slate-600">
          Aktualna wersja release agenta: <span className="font-semibold text-slate-900">{latestReleaseVersion}</span>
        </p>
      ) : null}

      {error ? <PrintingAlert tone="error">{error}</PrintingAlert> : null}
      {success ? <PrintingAlert tone="success">{success}</PrintingAlert> : null}

      {loading ? (
        <PrintingLoadingState />
      ) : rows.length === 0 ? (
        <PrintingEmptyState>Brak zarejestrowanych agentów drukowania.</PrintingEmptyState>
      ) : (
        <PrintingDataTable>
          <PrintingTableHead>
            <tr>
              <PrintingTableHeadCell>Komputer</PrintingTableHeadCell>
              <PrintingTableHeadCell>Machine ID</PrintingTableHeadCell>
              <PrintingTableHeadCell>Wersja agenta</PrintingTableHeadCell>
              <PrintingTableHeadCell>Release</PrintingTableHeadCell>
              <PrintingTableHeadCell>Status wersji</PrintingTableHeadCell>
              <PrintingTableHeadCell>Magazyn</PrintingTableHeadCell>
              <PrintingTableHeadCell>Drukarki</PrintingTableHeadCell>
              <PrintingTableHeadCell>Status</PrintingTableHeadCell>
              <PrintingTableHeadCell>Ostatni heartbeat</PrintingTableHeadCell>
              <PrintingTableHeadCell>Akcje</PrintingTableHeadCell>
            </tr>
          </PrintingTableHead>
          <PrintingTableBody>
            {rows.map((row) => {
              const versionState = compareAgentVersions(row.version, latestReleaseVersion);
              return (
                <PrintingTableRow key={row.id}>
                  <PrintingTableCell>{row.name}</PrintingTableCell>
                  <PrintingTableCell className="font-mono text-xs text-slate-600">{row.machine_id}</PrintingTableCell>
                  <PrintingTableCell>{row.version ?? "—"}</PrintingTableCell>
                  <PrintingTableCell>{latestReleaseVersion ?? "—"}</PrintingTableCell>
                  <PrintingTableCell>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${agentVersionBadgeClass(versionState)}`}
                    >
                      {agentVersionBadgeLabel(versionState)}
                    </span>
                    {versionState === "update" ? (
                      <button
                        type="button"
                        className="ml-2 text-xs font-semibold text-orange-600 hover:text-orange-700"
                        onClick={handleUpdateAgent}
                      >
                        Zaktualizuj agenta
                      </button>
                    ) : null}
                  </PrintingTableCell>
                  <PrintingTableCell>{row.warehouse_id ?? "—"}</PrintingTableCell>
                  <PrintingTableCell>{row.printer_count ?? 0}</PrintingTableCell>
                  <PrintingTableCell>
                    <PrintingStatusBadge
                      className={agentHealthClass(row.health_status ?? (row.is_online ? "online" : "offline"))}
                    >
                      {agentHealthLabel(row.health_status ?? (row.is_online ? "online" : "offline"))}
                    </PrintingStatusBadge>
                  </PrintingTableCell>
                  <PrintingTableCell className="whitespace-nowrap">{formatDate(row.last_seen_at)}</PrintingTableCell>
                  <PrintingTableCell>
                    <AgentActionsCell
                      busy={actionId === row.id}
                      onCopyMachineId={() => void copyMachineId(row.machine_id)}
                      onDiagnostics={() => setDiagnosticsAgent(row)}
                      onSync={() => void runAgentSync(row.id)}
                      onRestart={() => void runAgentRestart(row.id)}
                      onTestPage={() => void runTestPage(row.id)}
                    />
                  </PrintingTableCell>
                </PrintingTableRow>
              );
            })}
          </PrintingTableBody>
        </PrintingDataTable>
      )}

      <AddComputerModal
        open={addComputerOpen}
        onClose={() => {
          setAddComputerOpen(false);
          void load();
        }}
      />

      <AgentDiagnosticsModal
        open={diagnosticsAgent != null}
        agent={diagnosticsAgent}
        tenantId={DAMAGE_TENANT_ID}
        onClose={() => setDiagnosticsAgent(null)}
      />
    </PrintingPageBody>
  );
}
