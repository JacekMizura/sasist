import type { ManualExecutionMode, OrderAutomationManualTrigger } from "../../../types/orderAutomation";
import {
  DEFAULT_MANUAL_CONFIRM_MESSAGE,
  resolveManualTriggerColor,
} from "../../../utils/orderAutomationManualTrigger";
import { ManualTriggerButtonPreview } from "./ManualTriggerButtonPreview";
import { oaBtn, oaBtnPri, oaInp, oaLbl } from "./orderAutomationUiTokens";

type Props = {
  manualTrigger: OrderAutomationManualTrigger;
  onChange: (patch: Partial<OrderAutomationManualTrigger>) => void;
};

function RadioOption<T extends string>({
  name,
  value,
  current,
  label,
  description,
  onSelect,
}: {
  name: string;
  value: T;
  current: T;
  label: string;
  description?: string;
  onSelect: (v: T) => void;
}) {
  return (
    <label className="flex cursor-pointer gap-2 text-sm text-slate-800">
      <input
        type="radio"
        name={name}
        className="mt-0.5 h-4 w-4 shrink-0 border-slate-300 text-slate-900"
        checked={current === value}
        onChange={() => onSelect(value)}
      />
      <span>
        <span className="font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-slate-600">{description}</span> : null}
      </span>
    </label>
  );
}

export function AutomationManualConfirmSection({ manualTrigger, onChange }: Props) {
  const mode = manualTrigger.executionMode ?? "immediate";
  const confirmMessage = manualTrigger.confirmMessage?.trim() || DEFAULT_MANUAL_CONFIRM_MESSAGE;
  const bg = resolveManualTriggerColor(manualTrigger.color);

  return (
    <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">Potwierdzenie wykonania</p>
        <p className="mt-0.5 text-sm text-slate-600">Co dzieje się po kliknięciu aktywatora przez operatora.</p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-800">Tryb wykonania</p>
        <div className="flex flex-col gap-3">
          <RadioOption<ManualExecutionMode>
            name="manualExecutionMode"
            value="immediate"
            current={mode}
            label="Wykonaj od razu"
            description="Po kliknięciu akcja wykonuje się natychmiast (po ewentualnej weryfikacji warunków)."
            onSelect={(v) => onChange({ executionMode: v })}
          />
          <RadioOption<ManualExecutionMode>
            name="manualExecutionMode"
            value="confirm"
            current={mode}
            label="Wymagaj potwierdzenia"
            description="Po kliknięciu akcja nie wykonuje się od razu — operator musi potwierdzić w kolejnym kroku."
            onSelect={(v) => onChange({ executionMode: v })}
          />
        </div>
      </div>

      {mode === "confirm" ? (
        <label className={oaLbl}>
          Treść potwierdzenia
          <textarea
            className={`${oaInp} mt-1 min-h-[4.5rem] resize-y py-2`}
            rows={3}
            value={manualTrigger.confirmMessage ?? DEFAULT_MANUAL_CONFIRM_MESSAGE}
            placeholder={DEFAULT_MANUAL_CONFIRM_MESSAGE}
            onChange={(e) => onChange({ confirmMessage: e.target.value })}
          />
        </label>
      ) : null}

      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Podgląd</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ManualTriggerButtonPreview manualTrigger={manualTrigger} />
        </div>
        {mode === "confirm" ? (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-700">{confirmMessage}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={oaBtn} disabled>
                Anuluj
              </button>
              <button
                type="button"
                className={oaBtnPri}
                disabled
                style={{ backgroundColor: bg }}
              >
                Potwierdź
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
