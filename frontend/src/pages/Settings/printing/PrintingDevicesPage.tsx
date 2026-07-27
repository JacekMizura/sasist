import { useCallback, useEffect, useMemo, useState } from "react";

import { patchAgentPrinter } from "../../../api/printingApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { useWarehouse } from "../../../context/WarehouseContext";
import {
  EDGE_DEVICE_STATUS_LABELS,
  EDGE_DEVICE_TYPE_LABELS,
  deviceDisplayName,
  fetchEdgeDevices,
  filterDevicesByType,
  type EdgeDevice,
  type EdgeDeviceStatus,
  type EdgeDeviceType,
} from "../../../devices";
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

/** UI type chips — ready for scanners/scales without backend rebuild. */
const TYPE_FILTERS: Array<{ value: EdgeDeviceType | "all"; label: string }> = [
  { value: "all", label: "Wszystkie" },
  { value: "printer", label: EDGE_DEVICE_TYPE_LABELS.printer },
  { value: "scanner", label: EDGE_DEVICE_TYPE_LABELS.scanner },
  { value: "scale", label: EDGE_DEVICE_TYPE_LABELS.scale },
  { value: "camera", label: EDGE_DEVICE_TYPE_LABELS.camera },
  { value: "rfid", label: EDGE_DEVICE_TYPE_LABELS.rfid },
];

export default function PrintingDevicesPage() {
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = showWarehouseSelector ? activeWarehouse?.id ?? null : activeWarehouse?.id ?? null;
  const [rows, setRows] = useState<EdgeDevice[]>([]);
  const [typeFilter, setTypeFilter] = useState<EdgeDeviceType | "all">("printer");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEdgeDevices({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
      });
      setRows(data);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się pobrać urządzeń."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => filterDevicesByType(rows, typeFilter), [rows, typeFilter]);
  const activeCount = useMemo(() => visible.filter((r) => r.is_active).length, [visible]);

  const printerTypeOf = (row: EdgeDevice): string =>
    String((row.metadata as { printer_type?: string } | undefined)?.printer_type || "other");

  const updateType = async (row: EdgeDevice, printer_type: string) => {
    if (row.legacy_printer_id == null) return;
    setSavingId(row.id);
    try {
      await patchAgentPrinter(DAMAGE_TENANT_ID, row.legacy_printer_id, { printer_type });
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się zapisać typu drukarki."));
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (row: EdgeDevice) => {
    if (row.legacy_printer_id == null) return;
    setSavingId(row.id);
    try {
      await patchAgentPrinter(DAMAGE_TENANT_ID, row.legacy_printer_id, { is_active: !row.is_active });
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się zmienić statusu urządzenia."));
    } finally {
      setSavingId(null);
    }
  };

  const statusLabel = (status: string) =>
    EDGE_DEVICE_STATUS_LABELS[status as EdgeDeviceStatus] ?? status;

  return (
    <PrintingPageBody>
      <p className="text-sm text-slate-600">
        Aktywne urządzenia: <span className="font-semibold text-orange-600">{activeCount}</span> / {visible.length}
        <span className="ml-2 text-slate-400">(rejestr uniwersalny — obecnie drukarki)</span>
      </p>

      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setTypeFilter(f.value)}
            className={
              typeFilter === f.value
                ? "rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-orange-300"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <PrintingAlert tone="error">{error}</PrintingAlert> : null}

      {loading ? (
        <PrintingLoadingState />
      ) : visible.length === 0 ? (
        <PrintingEmptyState>
          {typeFilter === "printer" || typeFilter === "all"
            ? "Brak drukarek z agentów. Zainstaluj Sasist Agent na PC w magazynie."
            : `Brak urządzeń typu „${EDGE_DEVICE_TYPE_LABELS[typeFilter as EdgeDeviceType] ?? typeFilter}”. Moduł pojawi się w kolejnych etapach.`}
        </PrintingEmptyState>
      ) : (
        <PrintingDataTable>
          <PrintingTableHead>
            <tr>
              <PrintingTableHeadCell>Nazwa</PrintingTableHeadCell>
              <PrintingTableHeadCell>Typ</PrintingTableHeadCell>
              <PrintingTableHeadCell>Status</PrintingTableHeadCell>
              <PrintingTableHeadCell>Media / rodzaj</PrintingTableHeadCell>
              <PrintingTableHeadCell>Agent</PrintingTableHeadCell>
              <PrintingTableHeadCell>Aktywna</PrintingTableHeadCell>
            </tr>
          </PrintingTableHead>
          <PrintingTableBody>
            {visible.map((row) => (
              <PrintingTableRow key={row.id}>
                <PrintingTableCell>
                  <div>{deviceDisplayName(row)}</div>
                  <div className="text-xs text-slate-500">{row.id}</div>
                </PrintingTableCell>
                <PrintingTableCell className="text-slate-600">
                  {EDGE_DEVICE_TYPE_LABELS[row.type as EdgeDeviceType] ?? row.type}
                </PrintingTableCell>
                <PrintingTableCell className="text-slate-600">{statusLabel(row.status)}</PrintingTableCell>
                <PrintingTableCell>
                  {row.type === "printer" && row.legacy_printer_id != null ? (
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      value={printerTypeOf(row)}
                      disabled={savingId === row.id}
                      onChange={(e) => void updateType(row, e.target.value)}
                    >
                      {PRINTER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </PrintingTableCell>
                <PrintingTableCell className="text-slate-600">{row.agent_id ?? "—"}</PrintingTableCell>
                <PrintingTableCell>
                  {row.legacy_printer_id != null ? (
                    <PrintingLinkButton disabled={savingId === row.id} onClick={() => void toggleActive(row)}>
                      {row.is_active ? "Tak" : "Nie"}
                    </PrintingLinkButton>
                  ) : (
                    row.is_active ? "Tak" : "Nie"
                  )}
                </PrintingTableCell>
              </PrintingTableRow>
            ))}
          </PrintingTableBody>
        </PrintingDataTable>
      )}
    </PrintingPageBody>
  );
}
