import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { AutomationEffect, AutomationEffectKind } from "../../../types/orderAutomation";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import { buildEffectCategorySteps, effectKindLabel } from "../../../utils/orderAutomationCatalog";
import { renderAutomationEffectConfigEditor } from "./effects/orderAutomationEffectEditorRenderers";
import { AutomationCategoryPickerModal } from "./AutomationCategoryPickerModal";
import { AutomationStatusPicker } from "./AutomationStatusPicker";
import { AutomationValueBadges } from "./AutomationValueBadges";
import { oaWorkflowBlockBodyClass } from "./orderAutomationUiTokens";

const sentenceTriggerClass =
  "inline-flex h-8 max-w-full min-w-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-medium text-slate-900 transition hover:border-slate-300";

export type AutomationEffectConfigFieldsProps = {
  effect: AutomationEffect;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  statusNameById: Map<number, string>;
  onChangeKind: (kind: AutomationEffectKind) => void;
  onPatchPayload: (partial: Record<string, string | number | boolean | null>) => void;
};

export function AutomationEffectConfigFields({
  effect,
  panelSummary,
  panelSubgroups,
  statusNameById,
  onChangeKind,
  onPatchPayload,
}: AutomationEffectConfigFieldsProps) {
  const [kindPickerOpen, setKindPickerOpen] = useState(false);
  const [focusStatusId, setFocusStatusId] = useState<number | null>(null);
  const categorySteps = useMemo(() => buildEffectCategorySteps(), []);
  const title = effectKindLabel(effect.kind);

  if (effect.kind === "change_status") {
    const raw = effect.payload.order_ui_status_id;
    const selectedId = raw === "" || raw == null ? null : Number(raw);
    const selectedStatusId =
      selectedId != null && Number.isFinite(selectedId) && selectedId > 0 ? selectedId : null;
    const selectedLabel =
      selectedStatusId != null ? statusNameById.get(selectedStatusId) ?? `#${selectedStatusId}` : null;

    return (
      <>
        <div className="space-y-2">
          <button type="button" className={sentenceTriggerClass} onClick={() => setKindPickerOpen(true)}>
            <span className="min-w-0 truncate">{title}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </button>

          {selectedLabel ? (
            <AutomationValueBadges
              labels={[selectedLabel]}
              removable
              onRemove={() => onPatchPayload({ order_ui_status_id: "" })}
              onBadgeClick={() => {
                if (selectedStatusId != null) setFocusStatusId(selectedStatusId);
              }}
            />
          ) : null}

          <AutomationStatusPicker
            panelSummary={panelSummary}
            panelSubgroups={panelSubgroups}
            selectedStatusId={selectedStatusId}
            focusStatusId={focusStatusId}
            onFocusStatusHandled={() => setFocusStatusId(null)}
            onPick={(statusId) =>
              onPatchPayload({ order_ui_status_id: statusId != null ? String(statusId) : "" })
            }
          />
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

  return (
    <>
      <div className="space-y-2">
        <button type="button" className={sentenceTriggerClass} onClick={() => setKindPickerOpen(true)}>
          <span className="min-w-0 truncate">{title}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
        <div className={`${oaWorkflowBlockBodyClass} !px-0 !py-0`}>
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
