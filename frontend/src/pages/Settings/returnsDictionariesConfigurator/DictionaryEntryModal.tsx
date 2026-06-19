import { useEffect, useState } from "react";

import type { ReturnCustomerReturnTypeDto, ReturnOrderSourceDto } from "../../../types/returnModuleConfig";
import { ReturnsConfiguratorModalShell } from "../returnsStatusesConfigurator/ReturnsConfiguratorModalShell";
import { OrderSourceLogo } from "./OrderSourceLogo";
import { ORDER_SOURCE_MARKETPLACE_PRESETS } from "./marketplaceSourceUtils";

const inp = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300";
const lab = "block text-xs font-medium text-slate-600";

type ReturnTypeModalProps = {
  open: boolean;
  mode: "create" | "edit";
  row: ReturnCustomerReturnTypeDto | null;
  onClose: () => void;
  onSave: (entry: ReturnCustomerReturnTypeDto) => void;
};

export function ReturnTypeEntryModal({ open, mode, row, onClose, onSave }: ReturnTypeModalProps) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (open) setLabel(row?.label ?? "");
  }, [open, row]);

  return (
    <ReturnsConfiguratorModalShell
      open={open}
      title={mode === "create" ? "Nowy rodzaj zwrotu" : "Edytuj rodzaj zwrotu"}
      subtitle="Nazwa widoczna dla klienta w formularzu zwrotu."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={!label.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-45"
            onClick={() => row && onSave({ ...row, label: label.trim() })}
          >
            Zapisz
          </button>
        </>
      }
    >
      <label className={lab}>
        Nazwa
        <input className={inp} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      </label>
    </ReturnsConfiguratorModalShell>
  );
}

type SourceModalProps = {
  open: boolean;
  mode: "create" | "edit";
  row: ReturnOrderSourceDto | null;
  onClose: () => void;
  onSave: (entry: ReturnOrderSourceDto) => void;
};

export function OrderSourceEntryModal({ open, mode, row, onClose, onSave }: SourceModalProps) {
  const [draft, setDraft] = useState<ReturnOrderSourceDto | null>(null);
  const [presetCode, setPresetCode] = useState<string>("custom");

  useEffect(() => {
    if (!open) return;
    setDraft(row);
    if (row) {
      const match = ORDER_SOURCE_MARKETPLACE_PRESETS.find((p) => p.code === row.code);
      setPresetCode(match ? match.code : "custom");
    } else {
      setPresetCode("allegro");
    }
  }, [open, row]);

  const applyPreset = (code: string) => {
    setPresetCode(code);
    if (code === "custom") return;
    const preset = ORDER_SOURCE_MARKETPLACE_PRESETS.find((p) => p.code === code);
    if (!preset || !draft) return;
    setDraft({ ...draft, code: preset.code, label: preset.label });
  };

  if (!draft) return null;

  return (
    <ReturnsConfiguratorModalShell
      open={open}
      title={mode === "create" ? "Nowe źródło" : "Edytuj źródło"}
      subtitle="Kanał sprzedaży w formularzu zwrotu klienta."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={!draft.label.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-45"
            onClick={() => onSave({ ...draft, label: draft.label.trim() })}
          >
            Zapisz
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className={lab}>
          Marketplace / sklep
          <select
            className={inp}
            value={presetCode}
            onChange={(e) => applyPreset(e.target.value)}
          >
            {ORDER_SOURCE_MARKETPLACE_PRESETS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
            <option value="custom">Inne (własna nazwa)</option>
          </select>
        </label>

        <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
          <OrderSourceLogo code={draft.code} label={draft.label} />
          <span className="text-xs text-slate-500">Podgląd logotypu na liście</span>
        </div>

        <label className={lab}>
          Nazwa
          <input
            className={inp}
            value={draft.label}
            onChange={(e) => {
              const nextLabel = e.target.value;
              setDraft((d) => (d ? { ...d, label: nextLabel } : d));
              if (presetCode === "custom") setPresetCode("custom");
            }}
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={draft.is_active}
            onChange={(e) => setDraft((d) => (d ? { ...d, is_active: e.target.checked } : d))}
          />
          Aktywny
        </label>
      </div>
    </ReturnsConfiguratorModalShell>
  );
}
