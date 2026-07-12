import { useEffect, useMemo, useState } from "react";

import {
  LABEL_PROFILE_PRESETS,
  createLabelPrintingProfile,
  type LabelProfilePresetId,
} from "./labelProfileWizardApi";
import { PrintQueueGhostButton, PrintQueuePrimaryButton } from "./printQueueUi";

type Props = {
  open: boolean;
  tenantId: number;
  warehouseId: number | null;
  systemPrinters: string[];
  onClose: () => void;
  onCreated: (printerId: number) => void;
};

export function LabelProfileWizardModal({
  open,
  tenantId,
  warehouseId,
  systemPrinters,
  onClose,
  onCreated,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [systemPrinterName, setSystemPrinterName] = useState("");
  const [presetId, setPresetId] = useState<LabelProfilePresetId>("200x40");
  const [customProfileName, setCustomProfileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPresetId("200x40");
    setCustomProfileName("");
    setError(null);
    setSystemPrinterName(systemPrinters.length === 1 ? systemPrinters[0] : "");
  }, [open, systemPrinters]);

  const selectedPreset = useMemo(
    () => LABEL_PROFILE_PRESETS.find((preset) => preset.id === presetId) ?? LABEL_PROFILE_PRESETS[0],
    [presetId],
  );

  const profileName =
    presetId === "custom" ? customProfileName.trim() : selectedPreset.profileName.trim();

  const canContinueStep1 = Boolean(systemPrinterName.trim());
  const canContinueStep2 = presetId !== "custom" || Boolean(customProfileName.trim());
  const canSave = canContinueStep1 && canContinueStep2 && Boolean(profileName);

  if (!open) return null;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createLabelPrintingProfile({
        tenantId,
        warehouseId,
        systemPrinterName,
        profileName,
        dpi: selectedPreset.dpi,
      });
      onCreated(result.printer.id);
      onClose();
    } catch (err) {
      console.error("Create label profile failed:", err);
      setError("Nie udało się zapisać profilu drukowania. Spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Utwórz profil drukowania</h3>
            <p className="mt-1 text-sm text-slate-600">Krok {step} z 3</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            aria-label="Zamknij"
          >
            ✕
          </button>
        </div>

        {step === 1 ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-700">Wybierz drukarkę systemową wykrytą przez agenta Windows.</p>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Drukarka systemowa
            </label>
            <select
              value={systemPrinterName}
              onChange={(event) => setSystemPrinterName(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-300/40"
            >
              <option value="">— Wybierz drukarkę —</option>
              {systemPrinters.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-700">Wybierz typ etykiety dla profilu.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {LABEL_PROFILE_PRESETS.map((preset) => (
                <label
                  key={preset.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    presetId === preset.id
                      ? "border-cyan-400 bg-cyan-50/70 text-slate-900"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="label-profile-preset"
                    checked={presetId === preset.id}
                    onChange={() => setPresetId(preset.id)}
                  />
                  <span>{preset.label}</span>
                </label>
              ))}
            </div>
            {presetId === "custom" ? (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nazwa profilu
                </label>
                <input
                  value={customProfileName}
                  onChange={(event) => setCustomProfileName(event.target.value)}
                  placeholder="np. 150x100 ZPL"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-300/40"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-4 space-y-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">Podsumowanie</p>
            <dl className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Drukarka systemowa</dt>
                <dd className="text-right font-medium text-slate-900">{systemPrinterName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Profil drukowania</dt>
                <dd className="text-right font-medium text-slate-900">{profileName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">DPI</dt>
                <dd className="text-right font-medium text-slate-900">{selectedPreset.dpi}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {step > 1 ? (
            <PrintQueueGhostButton onClick={() => setStep((current) => (current === 3 ? 2 : 1))}>
              Wstecz
            </PrintQueueGhostButton>
          ) : (
            <PrintQueueGhostButton onClick={onClose}>Anuluj</PrintQueueGhostButton>
          )}
          {step === 1 ? (
            <PrintQueuePrimaryButton
              className="w-auto"
              onClick={() => setStep(2)}
              disabled={!canContinueStep1}
            >
              Dalej
            </PrintQueuePrimaryButton>
          ) : null}
          {step === 2 ? (
            <PrintQueuePrimaryButton
              className="w-auto"
              onClick={() => setStep(3)}
              disabled={!canContinueStep2}
            >
              Dalej
            </PrintQueuePrimaryButton>
          ) : null}
          {step === 3 ? (
            <PrintQueuePrimaryButton
              className="w-auto"
              onClick={() => void handleSave()}
              disabled={!canSave || saving}
            >
              {saving ? "Zapisywanie…" : "Zapisz profil"}
            </PrintQueuePrimaryButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
