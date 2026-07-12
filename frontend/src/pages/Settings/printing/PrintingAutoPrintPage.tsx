import { useCallback, useEffect, useState } from "react";

import { fetchPrintingAutoPrint, updatePrintingAutoPrint } from "../../../api/printingApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import type { PrintingAutoPrintRead } from "../../../types/printing";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import {
  PrintingAlert,
  PrintingLoadingState,
  PrintingPageBody,
  PrintingPrimaryButton,
} from "./components/printingUi";

const FIELDS: { key: keyof PrintingAutoPrintRead; label: string; hint: string }[] = [
  { key: "labels", label: "Etykiety", hint: "Automatyczny wydruk etykiet po wygenerowaniu (wkrótce)." },
  {
    key: "stock_documents",
    label: "Dokumenty magazynowe",
    hint: "PZ, PW, RW, MM, WZ, ZD — bez automatycznego wykonania w tej fazie.",
  },
  { key: "sale_documents", label: "Dokumenty sprzedażowe", hint: "FV, PAR, KOR — tylko konfiguracja." },
  { key: "shipping_labels", label: "Etykiety wysyłkowe", hint: "Etykiety kurierskie — tylko konfiguracja." },
];

export default function PrintingAutoPrintPage() {
  const [values, setValues] = useState<PrintingAutoPrintRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPrintingAutoPrint(DAMAGE_TENANT_ID);
      setValues(data);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się pobrać ustawień auto-druk."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!values) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updatePrintingAutoPrint(DAMAGE_TENANT_ID, {
        labels: values.labels,
        stock_documents: values.stock_documents,
        sale_documents: values.sale_documents,
        shipping_labels: values.shipping_labels,
      });
      setValues(updated);
      setSaved(true);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się zapisać ustawień."));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !values) {
    return (
      <PrintingPageBody>
        <PrintingLoadingState />
      </PrintingPageBody>
    );
  }

  return (
    <PrintingPageBody className="max-w-xl">
      <p className="text-sm text-slate-600">
        Konfiguracja automatycznego drukowania na poziomie tenantu. W tej fazie zapisywane są tylko preferencje — wydruki
        nie są uruchamiane automatycznie.
      </p>
      {error ? <PrintingAlert tone="error">{error}</PrintingAlert> : null}
      {saved ? <PrintingAlert tone="success">Zapisano ustawienia auto-druk.</PrintingAlert> : null}

      {FIELDS.map((field) => (
        <label
          key={field.key}
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-orange-200"
        >
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500/30"
            checked={Boolean(values[field.key])}
            onChange={(e) => {
              setValues((prev) => (prev ? { ...prev, [field.key]: e.target.checked } : prev));
              setSaved(false);
            }}
          />
          <span>
            <span className="block text-sm font-medium text-slate-800">{field.label}</span>
            <span className="block text-xs text-slate-500">{field.hint}</span>
          </span>
        </label>
      ))}

      <PrintingPrimaryButton disabled={saving} onClick={() => void save()}>
        {saving ? "Zapisywanie…" : "Zapisz"}
      </PrintingPrimaryButton>
    </PrintingPageBody>
  );
}
