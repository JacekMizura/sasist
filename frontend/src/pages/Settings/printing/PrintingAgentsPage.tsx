import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchPrintingAgents, fetchPrintJobs, sendAgentTestPage } from "../../../api/printingApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { useWarehouse } from "../../../context/WarehouseContext";
import type { PrinterAgentRead } from "../../../types/printing";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { agentHealthClass, agentHealthLabel } from "./printingQueuePresentation";
import AddComputerModal from "./AddComputerModal";
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, pending] = await Promise.all([
        fetchPrintingAgents(DAMAGE_TENANT_ID, warehouseId),
        fetchPrintJobs(DAMAGE_TENANT_ID, { warehouseId, status: "pending", limit: 500 }),
      ]);
      setRows(data);
      setPendingJobs(pending.length);
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
              <PrintingTableHeadCell>Wersja</PrintingTableHeadCell>
              <PrintingTableHeadCell>Magazyn</PrintingTableHeadCell>
              <PrintingTableHeadCell>Drukarki</PrintingTableHeadCell>
              <PrintingTableHeadCell>Status</PrintingTableHeadCell>
              <PrintingTableHeadCell>Ostatni heartbeat</PrintingTableHeadCell>
              <PrintingTableHeadCell>Ostatni polling</PrintingTableHeadCell>
              <PrintingTableHeadCell>Ostatni błąd</PrintingTableHeadCell>
              <PrintingTableHeadCell>Diagnostyka</PrintingTableHeadCell>
            </tr>
          </PrintingTableHead>
          <PrintingTableBody>
            {rows.map((row) => (
              <PrintingTableRow key={row.id}>
                <PrintingTableCell>{row.name}</PrintingTableCell>
                <PrintingTableCell className="font-mono text-xs text-slate-600">{row.machine_id}</PrintingTableCell>
                <PrintingTableCell>{row.version ?? "—"}</PrintingTableCell>
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
                <PrintingTableCell className="whitespace-nowrap">{formatDate(row.last_poll_at)}</PrintingTableCell>
                <PrintingTableCell className="max-w-[14rem] truncate text-red-600" title={row.last_error ?? undefined}>
                  {row.last_error ?? "—"}
                </PrintingTableCell>
                <PrintingTableCell>
                  <PrintingLinkButton disabled={actionId === row.id} onClick={() => void runTestPage(row.id)}>
                    Strona testowa
                  </PrintingLinkButton>
                </PrintingTableCell>
              </PrintingTableRow>
            ))}
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
    </PrintingPageBody>
  );
}
