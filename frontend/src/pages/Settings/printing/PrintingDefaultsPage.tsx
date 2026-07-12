import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  fetchAgentPrinters,
  fetchPrintingDefaults,
  repairPrinterAssignments,
  updatePrintingDefaults,
} from "../../../api/printingApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { useWarehouse } from "../../../context/WarehouseContext";
import type { AgentPrinterRead } from "../../../types/printing";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { agentHealthLabel } from "./printingQueuePresentation";
import {
  PrintingAlert,
  PrintingLoadingState,
  PrintingPageBody,
  PrintingPrimaryButton,
  printingTheme,
} from "./components/printingUi";

type DefaultField = "a4_printer_id" | "label_printer_id" | "receipt_printer_id";

const FIELDS: { key: DefaultField; label: string; type: string }[] = [
  { key: "a4_printer_id", label: "Domyślna drukarka A4", type: "a4" },
  { key: "label_printer_id", label: "Domyślna drukarka etykiet", type: "label" },
  { key: "receipt_printer_id", label: "Domyślna drukarka paragonów", type: "receipt" },
];

function agentStatusLabel(printer: AgentPrinterRead): string {
  if (printer.agent_is_online) return "Połączony";
  return agentHealthLabel(printer.agent_health_status ?? "offline");
}

function PrinterOptionDetails({ printer }: { printer: AgentPrinterRead }) {
  const online = printer.agent_is_online;
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <div className="grid gap-1 sm:grid-cols-2">
        <div>
          <span className="font-medium text-slate-700">Drukarka:</span> {printer.name}
        </div>
        <div>
          <span className="font-medium text-slate-700">Komputer:</span> {printer.agent_name ?? "—"}
        </div>
        <div className="font-mono sm:col-span-2">
          <span className="font-medium font-sans text-slate-700">Machine ID:</span> {printer.machine_id ?? "—"}
        </div>
        <div>
          <span className="font-medium text-slate-700">Status agenta:</span>{" "}
          <span className={online ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
            {agentStatusLabel(printer)}
          </span>
        </div>
      </div>
    </div>
  );
}

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
  const [repairing, setRepairing] = useState(false);
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

  const printersById = useMemo(() => new Map(printers.map((p) => [p.id, p])), [printers]);

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

  const repair = async () => {
    setRepairing(true);
    setError(null);
    setSaved(false);
    try {
      const result = await repairPrinterAssignments(DAMAGE_TENANT_ID, warehouseId);
      toast.success(
        `Naprawiono przypisania: ${result.defaults_remapped} domyślnych, ${result.jobs_migrated} zadań oczekujących.`,
      );
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się naprawić przypisań drukarek."));
    } finally {
      setRepairing(false);
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
    <PrintingPageBody className="max-w-2xl">
      {error ? <PrintingAlert tone="error">{error}</PrintingAlert> : null}
      {saved ? <PrintingAlert tone="success">Zapisano domyślne drukarki.</PrintingAlert> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={repairing || saving}
          onClick={() => void repair()}
          className={`inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50 ${printingTheme.primaryOutline}`}
        >
          {repairing ? "Naprawianie…" : "Napraw przypisania drukarek"}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Przenosi domyślne drukarki i oczekujące zadania na najnowszego aktywnego agenta w magazynie.
      </p>

      {FIELDS.map((field) => {
        const selected = values[field.key] ? printersById.get(values[field.key]!) : undefined;
        const options = optionsByType[field.type]?.length ? optionsByType[field.type] : printers;
        return (
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
              {options.map((p) => {
                const status = agentStatusLabel(p);
                const disabled = !p.agent_is_online;
                return (
                  <option key={p.id} value={p.id} disabled={disabled}>
                    {p.name} · {p.agent_name ?? "—"} · {p.machine_id ?? "—"} · {status}
                  </option>
                );
              })}
            </select>
            {selected ? <PrinterOptionDetails printer={selected} /> : null}
            {!selected && values[field.key] ? (
              <p className="text-xs text-amber-700">Wybrana drukarka jest niedostępna — użyj „Napraw przypisania”.</p>
            ) : null}
          </label>
        );
      })}

      <PrintingPrimaryButton disabled={saving || repairing} onClick={() => void save()}>
        {saving ? "Zapisywanie…" : "Zapisz"}
      </PrintingPrimaryButton>
    </PrintingPageBody>
  );
}
