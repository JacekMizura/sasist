import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { AutomationEffect, AutomationEffectKind } from "../../../types/orderAutomation";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import { buildEffectCategorySteps, effectKindLabel } from "../../../utils/orderAutomationCatalog";
import { renderAutomationEffectConfigEditor } from "./effects/orderAutomationEffectEditorRenderers";
import { AutomationCategoryPickerModal } from "./AutomationCategoryPickerModal";
import { oaInp, oaLbl, oaWorkflowBlockBodyClass } from "./orderAutomationUiTokens";

export type AutomationEffectConfigFieldsProps = {
  effect: AutomationEffect;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  onChangeKind: (kind: AutomationEffectKind) => void;
  onPatchPayload: (partial: Record<string, string | number | boolean | null>) => void;
};

/** Pola konfiguracji efektu — wspólne dla inline (bez shella modalu). */
export function AutomationEffectConfigFields({
  effect,
  panelSummary,
  panelSubgroups,
  onChangeKind,
  onPatchPayload,
}: AutomationEffectConfigFieldsProps) {
  const [kindPickerOpen, setKindPickerOpen] = useState(false);
  const categorySteps = useMemo(() => buildEffectCategorySteps(), []);
  const title = effectKindLabel(effect.kind);

  return (
    <>
      <div className="space-y-3">
        <div>
          <span className={oaLbl}>Typ akcji</span>
          <button
            type="button"
            className={`${oaInp} mt-1.5 flex w-full items-center justify-between text-left`}
            onClick={() => setKindPickerOpen(true)}
          >
            <span className="truncate">{title}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </div>
        <div className={oaWorkflowBlockBodyClass}>
          {renderAutomationEffectConfigEditor({
            kind: effect.kind,
            effect,
            panelSummary,
            panelSubgroups,
            patchPayload: onPatchPayload,
          })}
        </div>
      </div>

      <AutomationCategoryPickerModal
        open={kindPickerOpen}
        title="Zmień typ akcji"
        categories={categorySteps}
        onClose={() => setKindPickerOpen(false)}
        onPick={(id) => {
          onChangeKind(id as AutomationEffectKind);
          setKindPickerOpen(false);
        }}
      />
    </>
  );
}
