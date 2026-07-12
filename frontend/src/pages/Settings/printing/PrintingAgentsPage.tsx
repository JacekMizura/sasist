import { useCallback, useEffect, useState } from "react";

import { fetchPrintingAgents, sendAgentTestPage } from "../../../api/printingApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { useWarehouse } from "../../../context/WarehouseContext";
import type { PrinterAgentRead } from "../../../types/printing";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { agentHealthClass, agentHealthLabel } from "./printingQueuePresentation";
import AddComputerModal from "./AddComputerModal";

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPrintingAgents(DAMAGE_TENANT_ID, warehouseId);
      setRows(data);
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
    <div className="mt-4 min-w-0">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onClick={() => setAddComputerOpen(true)}
        >
          Dodaj komputer
        </button>
      </div>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}
      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Brak zarejestrowanych agentów drukowania.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Komputer</th>
                <th className="px-3 py-2 font-medium">Machine ID</th>
                <th className="px-3 py-2 font-medium">Wersja</th>
                <th className="px-3 py-2 font-medium">Magazyn</th>
                <th className="px-3 py-2 font-medium">Drukarki</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Ostatni heartbeat</th>
                <th className="px-3 py-2 font-medium">Ostatni polling</th>
                <th className="px-3 py-2 font-medium">Ostatni błąd</th>
                <th className="px-3 py-2 font-medium">Diagnostyka</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.machine_id}</td>
                  <td className="px-3 py-2">{row.version ?? "—"}</td>
                  <td className="px-3 py-2">{row.warehouse_id ?? "—"}</td>
                  <td className="px-3 py-2">{row.printer_count ?? 0}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${agentHealthClass(row.health_status ?? (row.is_online ? "online" : "offline"))}`}
                    >
                      {agentHealthLabel(row.health_status ?? (row.is_online ? "online" : "offline"))}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.last_seen_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.last_poll_at)}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2 text-red-600" title={row.last_error ?? undefined}>
                    {row.last_error ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-xs text-blue-700 underline disabled:opacity-50"
                      disabled={actionId === row.id}
                      onClick={() => void runTestPage(row.id)}
                    >
                      Strona testowa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AddComputerModal open={addComputerOpen} onClose={() => setAddComputerOpen(false)} />
    </div>
  );
}
