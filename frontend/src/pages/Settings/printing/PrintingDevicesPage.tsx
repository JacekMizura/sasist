import { useCallback, useEffect, useState } from "react";

import { fetchAgentPrinters, patchAgentPrinter } from "../../../api/printingApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { useWarehouse } from "../../../context/WarehouseContext";
import type { AgentPrinterRead } from "../../../types/printing";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";

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
    <div className="mt-4 min-w-0">
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Brak drukarek z agentów. Zainstaluj Sasist Printer Agent na PC w magazynie.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Nazwa</th>
                <th className="px-3 py-2 font-medium">System</th>
                <th className="px-3 py-2 font-medium">Typ</th>
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Aktywna</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 text-slate-600">{row.system_name}</td>
                  <td className="px-3 py-2">
                    <select
                      className="rounded border border-slate-200 px-2 py-1 text-sm"
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
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.agent_name ?? row.machine_id ?? row.agent_id}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-sm text-blue-700 hover:underline disabled:opacity-50"
                      disabled={savingId === row.id}
                      onClick={() => void toggleActive(row)}
                    >
                      {row.is_active ? "Tak" : "Nie"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
