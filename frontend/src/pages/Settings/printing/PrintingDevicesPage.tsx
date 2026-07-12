import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchAgentPrinters, patchAgentPrinter } from "../../../api/printingApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { useWarehouse } from "../../../context/WarehouseContext";
import type { AgentPrinterRead } from "../../../types/printing";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import {
  PrintingAlert,
  PrintingDataTable,
  PrintingEmptyState,
  PrintingLinkButton,
  PrintingLoadingState,
  PrintingPageBody,
  PrintingTableBody,
  PrintingTableCell,
  PrintingTableHead,
  PrintingTableHeadCell,
  PrintingTableRow,
} from "./components/printingUi";

const PRINTER_TYPES = [
  { value: "a4", label: "A4" },
  { value: "label", label: "Etykieta" },
  { value: "receipt", label: "Paragon" },
  { value: "other", label: "Inna" },
];

export default function PrintingDevicesPage() {
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = showWarehouseSelector ? activeWarehouse?.id ?? null : activeWarehouse?.id ?? null;
  const [rows, setRows] = useState<AgentPrinterRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAgentPrinters(DAMAGE_TENANT_ID, { warehouseId });
      setRows(data);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się pobrać drukarek."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(() => rows.filter((r) => r.is_active).length, [rows]);

  const updateType = async (row: AgentPrinterRead, printer_type: string) => {
    setSavingId(row.id);
    try {
      await patchAgentPrinter(DAMAGE_TENANT_ID, row.id, { printer_type });
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się zapisać typu drukarki."));
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (row: AgentPrinterRead) => {
    setSavingId(row.id);
    try {
      await patchAgentPrinter(DAMAGE_TENANT_ID, row.id, { is_active: !row.is_active });
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się zmienić statusu drukarki."));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <PrintingPageBody>
      <p className="text-sm text-slate-600">
        Aktywne drukarki: <span className="font-semibold text-orange-600">{activeCount}</span> / {rows.length}
      </p>

      {error ? <PrintingAlert tone="error">{error}</PrintingAlert> : null}

      {loading ? (
        <PrintingLoadingState />
      ) : rows.length === 0 ? (
        <PrintingEmptyState>
          Brak drukarek z agentów. Zainstaluj Sasist Printer Agent na PC w magazynie.
        </PrintingEmptyState>
      ) : (
        <PrintingDataTable>
          <PrintingTableHead>
            <tr>
              <PrintingTableHeadCell>Nazwa</PrintingTableHeadCell>
              <PrintingTableHeadCell>System</PrintingTableHeadCell>
              <PrintingTableHeadCell>Typ</PrintingTableHeadCell>
              <PrintingTableHeadCell>Agent</PrintingTableHeadCell>
              <PrintingTableHeadCell>Aktywna</PrintingTableHeadCell>
            </tr>
          </PrintingTableHead>
          <PrintingTableBody>
            {rows.map((row) => (
              <PrintingTableRow key={row.id}>
                <PrintingTableCell>{row.name}</PrintingTableCell>
                <PrintingTableCell className="text-slate-600">{row.system_name}</PrintingTableCell>
                <PrintingTableCell>
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    value={row.printer_type}
                    disabled={savingId === row.id}
                    onChange={(e) => void updateType(row, e.target.value)}
                  >
                    {PRINTER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </PrintingTableCell>
                <PrintingTableCell className="text-slate-600">
                  {row.agent_name ?? row.machine_id ?? row.agent_id}
                </PrintingTableCell>
                <PrintingTableCell>
                  <PrintingLinkButton disabled={savingId === row.id} onClick={() => void toggleActive(row)}>
                    {row.is_active ? "Tak" : "Nie"}
                  </PrintingLinkButton>
                </PrintingTableCell>
              </PrintingTableRow>
            ))}
          </PrintingTableBody>
        </PrintingDataTable>
      )}
    </PrintingPageBody>
  );
}
