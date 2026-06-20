import { useEffect, useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";

import type { AutomationEffect, AutomationEffectKind } from "../../../types/orderAutomation";
import { buildEffectCategorySteps, effectKindLabel } from "../../../utils/orderAutomationCatalog";
import { formatEffectPill } from "../../../utils/orderAutomationPreview";
import { renderAutomationEffectConfigEditor } from "./effects/orderAutomationEffectEditorRenderers";
import { AutomationCategoryPickerModal } from "./AutomationCategoryPickerModal";
import { oaBtn, oaBtnPri, oaInp, oaWorkflowBlockBodyClass } from "./orderAutomationUiTokens";

type Props = {
  open: boolean;
  effect: AutomationEffect | null;
  statusNameById: Map<number, string>;
  panelStatusOptions: { id: number; name: string }[];
  onClose: () => void;
  onChangeKind: (kind: AutomationEffectKind) => void;
  onPatchPayload: (partial: Record<string, string | number | boolean | null>) => void;
};

export function AutomationEffectEditModal({
  open,
  effect,
  statusNameById,
  panelStatusOptions,
  onClose,
  onChangeKind,
  onPatchPayload,
}: Props) {
  const [kindPickerOpen, setKindPickerOpen] = useState(false);
  const categorySteps = useMemo(() => buildEffectCategorySteps(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !kindPickerOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, kindPickerOpen]);

  if (!open || !effect) return null;

  const title = effectKindLabel(effect.kind);
  const summary = formatEffectPill(effect, statusNameById);

  return (
    <>
      <div
        className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal
        aria-label="Edytuj akcję"
        onClick={onClose}
      >
        <div
          className="flex max-h-[min(88vh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Akcja</p>
              <p className="truncate text-sm font-semibold text-slate-900">{summary || title}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              aria-label="Zamknij"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="mb-3">
              <span className="mb-1 block text-xs font-medium text-slate-600">Typ akcji</span>
              <button
                type="button"
                className={`${oaInp} flex items-center justify-between text-left`}
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
                statusOptions: panelStatusOptions,
                patchPayload: onPatchPayload,
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
            <button type="button" className={oaBtn} onClick={onClose}>
              Anuluj
            </button>
            <button type="button" className={oaBtnPri} onClick={onClose}>
              Gotowe
            </button>
          </div>
        </div>
      </div>

      <AutomationCategoryPickerModal
        open={kindPickerOpen}
        title="Zmień typ akcji"
        categories={categorySteps}
        onClose={() => setKindPickerOpen(false)}
        onPick={(id) => onChangeKind(id as AutomationEffectKind)}
      />
    </>
  );
}
