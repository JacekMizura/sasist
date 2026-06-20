import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { OrderAutomationManualTrigger } from "../../../types/orderAutomation";
import { getManualIconComponent } from "@/modules/orders/automation/utils/orderAutomationManualIcons";
import { resolveManualTriggerColor } from "../../../utils/orderAutomationManualTrigger";
import { AutomationIconGridPicker } from "./AutomationIconGridPicker";
import { ManualTriggerButtonPreview } from "./ManualTriggerButtonPreview";
import { oaInp, oaInpDense, oaLbl } from "./orderAutomationUiTokens";

type Props = {
  manualTrigger: OrderAutomationManualTrigger;
  onChange: (patch: Partial<OrderAutomationManualTrigger>) => void;
};

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
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
        checked={checked}
        onChange={onToggle}
      />
      {label}
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

  const toggleVisibility = (key: keyof Pick<
    OrderAutomationManualTrigger,
    "visibleOnOrderList" | "visibleOnOrderCard" | "visibleOnMultiActions" | "visibleOnWmsPacking"
  >) => {
    patch({ [key]: manualTrigger[key] === false });
  };

  return (
    <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">Uruchamianie ręczne</p>
        <p className="mt-0.5 text-sm text-slate-600">
          Operator uruchamia regułę przyciskiem w wybranych miejscach systemu.
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
          checked={buttonEnabled}
          onChange={() => patch({ buttonEnabled: !buttonEnabled })}
        />
        Włącz przycisk ręczny
      </label>

      {buttonEnabled ? (
        <>
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-800">Wygląd przycisku</p>
            <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
              <div className="space-y-4">
                <label className={oaLbl}>
                  Nazwa przycisku
                  <input
                    type="text"
                    className={`${oaInp} mt-1`}
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
                    className={`${oaInp} mt-1 flex w-full max-w-md items-center justify-between text-left`}
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
                  <div className="mt-1 flex max-w-md items-center gap-3">
                    <input
                      type="color"
                      className="h-9 w-14 cursor-pointer rounded-lg border border-slate-200 p-0.5"
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

              <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Podgląd</p>
                <div className="mt-3">
                  <ManualTriggerButtonPreview manualTrigger={manualTrigger} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-800">Widoczność</p>
            <p className="text-xs text-slate-500">Miejsca, w których może pojawić się aktywator (bez osobnych warunków).</p>
            <div className="mt-2 flex flex-col gap-2">
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

          <div className="border-t border-slate-100 pt-4">
            <label className={oaLbl}>
              Skrót klawiaturowy
              <input
                type="text"
                className={`${oaInp} mt-1 max-w-md font-mono text-sm`}
                value={manualTrigger.shortcut}
                placeholder="Ctrl+Shift+P"
                onChange={(e) => patch({ shortcut: e.target.value })}
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">Skrót wyświetlany obok przycisku w podglądzie i w UI operatora.</p>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-600"
                checked={manualTrigger.checkConditionsOnManualRun !== false}
                onChange={() =>
                  patch({ checkConditionsOnManualRun: manualTrigger.checkConditionsOnManualRun === false })
                }
              />
              <span>
                <span className="font-medium">Sprawdzaj warunki przy ręcznym uruchamianiu</span>
                <span className="mt-1 block text-slate-600">
                  Gdy włączone — przed wykonaniem weryfikowane są warunki reguły. Przy niespełnieniu: „Nie można
                  wykonać akcji. Warunki nie są spełnione.” Gdy wyłączone — akcja wykonuje się niezależnie od
                  warunków.
                </span>
              </span>
            </label>
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
