import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchAgentPrinters,
  fetchPrintingDefaults,
  updatePrintingDefaults,
} from "../../../api/printingApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { useWarehouse } from "../../../context/WarehouseContext";
import type { AgentPrinterRead } from "../../../types/printing";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import {
  PrintingAlert,
  PrintingLoadingState,
  PrintingPageBody,
  PrintingPrimaryButton,
} from "./components/printingUi";

type DefaultField = "a4_printer_id" | "label_printer_id" | "receipt_printer_id";

const FIELDS: { key: DefaultField; label: string; type: string }[] = [
  { key: "a4_printer_id", label: "Domyślna drukarka A4", type: "a4" },
  { key: "label_printer_id", label: "Domyślna drukarka etykiet", type: "label" },
  { key: "receipt_printer_id", label: "Domyślna drukarka paragonów", type: "receipt" },
];

export default function PrintingDefaultsPage() {
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = showWarehouseSelector ? activeWarehouse?.id ?? null : activeWarehouse?.id ?? null;
  const [printers, setPrinters] = useState<AgentPrinterRead[]>([]);
  const [values, setValues] = useState<Record<DefaultField, number | null>>({
    a4_printer_id: null,
    label_printer_id: null,
    receipt_printer_id: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [defaults, devices] = await Promise.all([
        fetchPrintingDefaults(DAMAGE_TENANT_ID, warehouseId),
        fetchAgentPrinters(DAMAGE_TENANT_ID, { warehouseId }),
      ]);
      setPrinters(devices.filter((p) => p.is_active));
      setValues({
        a4_printer_id: defaults.a4_printer_id,
        label_printer_id: defaults.label_printer_id,
        receipt_printer_id: defaults.receipt_printer_id,
      });
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się pobrać domyślnych drukarek."));
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const optionsByType = useMemo(() => {
    const map: Record<string, AgentPrinterRead[]> = { a4: [], label: [], receipt: [], other: [] };
    for (const p of printers) {
      (map[p.printer_type] ?? map.other).push(p);
    }
    return map;
  }, [printers]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updatePrintingDefaults(DAMAGE_TENANT_ID, { warehouse_id: warehouseId, ...values }, warehouseId);
      setSaved(true);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się zapisać ustawień."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PrintingPageBody>
        <PrintingLoadingState />
      </PrintingPageBody>
    );
  }

  return (
    <PrintingPageBody className="max-w-xl">
      {error ? <PrintingAlert tone="error">{error}</PrintingAlert> : null}
      {saved ? <PrintingAlert tone="success">Zapisano domyślne drukarki.</PrintingAlert> : null}

      {FIELDS.map((field) => (
        <label key={field.key} className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{field.label}</span>
          <select
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            value={values[field.key] ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setValues((prev) => ({
                ...prev,
                [field.key]: v ? Number(v) : null,
              }));
              setSaved(false);
            }}
          >
            <option value="">— brak —</option>
            {(optionsByType[field.type]?.length ? optionsByType[field.type] : printers).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.agent_name ?? p.machine_id ?? `agent ${p.agent_id}`})
              </option>
            ))}
          </select>
        </label>
      ))}

      <PrintingPrimaryButton disabled={saving} onClick={() => void save()}>
        {saving ? "Zapisywanie…" : "Zapisz"}
      </PrintingPrimaryButton>
    </PrintingPageBody>
  );
}
