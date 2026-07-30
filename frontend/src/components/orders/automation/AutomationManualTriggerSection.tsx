import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { OrderAutomationManualTrigger } from "../../../types/orderAutomation";
import { getManualIconComponent } from "@/modules/orders/automation/utils/orderAutomationManualIcons";
import { resolveManualTriggerColor } from "../../../utils/orderAutomationManualTrigger";
import { AutomationIconGridPicker } from "./AutomationIconGridPicker";
import { ManualTriggerButtonPreview } from "./ManualTriggerButtonPreview";
import { oaEditorHeaderCardClass, oaInp, oaInpDense, oaLbl } from "./orderAutomationUiTokens";

type Props = {
  manualTrigger: OrderAutomationManualTrigger;
  onChange: (patch: Partial<OrderAutomationManualTrigger>) => void;
};

const checkboxClass = "h-4 w-4 shrink-0 rounded border-slate-300 accent-orange-500";

function VisibilityCheckbox({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 transition hover:border-slate-300">
      <input type="checkbox" className={checkboxClass} checked={checked} onChange={onToggle} />
      <span className="min-w-0 leading-snug">{label}</span>
    </label>
  );
}

export function AutomationManualTriggerSection({ manualTrigger, onChange }: Props) {
  const iconPickerAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const buttonEnabled = manualTrigger.buttonEnabled !== false;
  const colorValue = resolveManualTriggerColor(manualTrigger.color);
  const IconPreview = getManualIconComponent(manualTrigger.iconKey || "Zap");

  const patch = (p: Partial<OrderAutomationManualTrigger>) => onChange(p);

  const toggleVisibility = (
    key: keyof Pick<
      OrderAutomationManualTrigger,
      "visibleOnOrderList" | "visibleOnOrderCard" | "visibleOnMultiActions" | "visibleOnWmsPacking"
    >,
  ) => {
    patch({ [key]: manualTrigger[key] === false });
  };

  return (
    <div className="space-y-4">
      <div className={`${oaEditorHeaderCardClass} space-y-4`}>
        <div>
          <p className="text-sm font-semibold text-slate-900">Uruchamianie ręczne</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Operator uruchamia regułę przyciskiem w wybranych miejscach systemu.
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={buttonEnabled}
            onChange={() => patch({ buttonEnabled: !buttonEnabled })}
          />
          Włącz przycisk ręczny
        </label>
      </div>

      {buttonEnabled ? (
        <>
          <div className={`${oaEditorHeaderCardClass}`}>
            <p className="text-sm font-semibold text-slate-900">Wygląd przycisku</p>
            <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:items-stretch">
              <div className="space-y-4">
                <label className={oaLbl}>
                  Nazwa przycisku
                  <input
                    type="text"
                    className={`${oaInp} mt-1.5`}
                    value={manualTrigger.label}
                    placeholder="np. Nadaj przesyłkę"
                    onChange={(e) => patch({ label: e.target.value })}
                  />
                </label>

                <div>
                  <span className={oaLbl}>Ikona przycisku</span>
                  <button
                    type="button"
                    ref={iconPickerAnchorRef}
                    className={`${oaInp} mt-1.5 flex w-full items-center justify-between text-left`}
                    onClick={() => setIconPickerOpen(true)}
                  >
                    <span className="flex items-center gap-2">
                      <IconPreview className="h-4 w-4 text-slate-600" strokeWidth={2} />
                      {manualTrigger.iconKey || "Zap"}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                </div>

                <label className={oaLbl}>
                  Kolor przycisku
                  <div className="mt-1.5 flex items-center gap-3">
                    <input
                      type="color"
                      className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200 p-0.5"
                      value={colorValue}
                      onChange={(e) => patch({ color: e.target.value })}
                    />
                    <input
                      type="text"
                      className={`${oaInpDense} flex-1 font-mono text-xs`}
                      value={colorValue}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (/^#[0-9A-Fa-f]{3,8}$/.test(v) || v === "") {
                          patch({ color: v || "#0f172a" });
                        }
                      }}
                      placeholder="#0f172a"
                    />
                  </div>
                </label>
              </div>

              <div className="flex min-h-[14rem] flex-col rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-5 lg:min-h-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Podgląd</p>
                <div className="flex flex-1 items-center justify-center py-6">
                  <ManualTriggerButtonPreview manualTrigger={manualTrigger} />
                </div>
              </div>
            </div>
          </div>

          <div className={`${oaEditorHeaderCardClass} space-y-4`}>
            <div>
              <p className="text-sm font-semibold text-slate-900">Widoczność</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                Miejsca, w których może pojawić się aktywator.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <VisibilityCheckbox
                checked={manualTrigger.visibleOnOrderList !== false}
                label="Lista zamówień"
                onToggle={() => toggleVisibility("visibleOnOrderList")}
              />
              <VisibilityCheckbox
                checked={manualTrigger.visibleOnOrderCard !== false}
                label="Karta zamówienia"
                onToggle={() => toggleVisibility("visibleOnOrderCard")}
              />
              <VisibilityCheckbox
                checked={manualTrigger.visibleOnMultiActions !== false}
                label="Multiakcje"
                onToggle={() => toggleVisibility("visibleOnMultiActions")}
              />
              <VisibilityCheckbox
                checked={manualTrigger.visibleOnWmsPacking !== false}
                label="Pakowanie WMS"
                onToggle={() => toggleVisibility("visibleOnWmsPacking")}
              />
            </div>
          </div>

          <div className={`${oaEditorHeaderCardClass} space-y-4`}>
            <p className="text-sm font-semibold text-slate-900">Skrót klawiaturowy</p>
            <label className={oaLbl}>
              Skrót
              <input
                type="text"
                className={`${oaInp} mt-1.5 max-w-md font-mono text-sm`}
                value={manualTrigger.shortcut}
                placeholder="Ctrl+Shift+P"
                onChange={(e) => patch({ shortcut: e.target.value })}
              />
            </label>
            <p className="text-sm leading-relaxed text-slate-500">
              Wyświetlany obok przycisku w podglądzie i w UI operatora.
            </p>
          </div>

          <div className={`${oaEditorHeaderCardClass} space-y-4`}>
            <p className="text-sm font-semibold text-slate-900">Sprawdzaj warunki przy ręcznym uruchamianiu</p>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={manualTrigger.checkConditionsOnManualRun !== false}
                onChange={() =>
                  patch({ checkConditionsOnManualRun: manualTrigger.checkConditionsOnManualRun === false })
                }
              />
              Włącz weryfikację warunków
            </label>
            <p className="text-sm leading-relaxed text-slate-500">
              Gdy opcja jest włączona, przed wykonaniem zostaną zweryfikowane warunki reguły. Gdy jest wyłączona,
              akcja zostanie wykonana niezależnie od warunków.
            </p>
          </div>
        </>
      ) : null}

      <AutomationIconGridPicker
        open={iconPickerOpen}
        anchorRef={iconPickerAnchorRef}
        selectedKey={manualTrigger.iconKey || "Zap"}
        onClose={() => setIconPickerOpen(false)}
        onPick={(key) =>
          patch({
            iconKey: key,
            iconSource: "system",
            icon: "",
          })
        }
      />
    </div>
  );
}
