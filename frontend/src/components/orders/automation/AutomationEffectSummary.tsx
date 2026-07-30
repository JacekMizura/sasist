import type { AutomationEffect } from "../../../types/orderAutomation";
import { effectKindLabel } from "../../../utils/orderAutomationCatalog";
import { formatEffectListBlock } from "../../../utils/orderAutomationPreview";
import { AutomationValueBadges, type AutomationBadgeTone } from "./AutomationValueBadges";

export type AutomationEffectSummaryProps = {
  effect: AutomationEffect;
  statusNameById?: Map<number, string>;
  truncateText?: boolean;
};

/** Shared effect summary (editor, list, history). */
export function AutomationEffectSummary({
  effect,
  statusNameById,
  truncateText = false,
}: AutomationEffectSummaryProps) {
  const block = formatEffectListBlock(effect, statusNameById);
  const title = effectKindLabel(effect.kind);
  const primary = block.primaryBold ?? block.secondaryDetail;

  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {effect.kind === "change_status" && primary ? (
        <AutomationValueBadges labels={[primary]} />
      ) : primary ? (
        <p
          className={`text-sm font-medium text-slate-800 ${truncateText ? "truncate" : ""}`}
          title={truncateText ? primary : undefined}
        >
          {primary}
        </p>
      ) : (
        <p className="text-sm text-slate-400">—</p>
      )}
      {block.secondaryDetail && block.primaryBold && effect.kind !== "change_status" ? (
        <p className={`text-sm text-slate-500 ${truncateText ? "truncate" : ""}`}>{block.secondaryDetail}</p>
      ) : null}
    </div>
  );
}

/** History free-form effect line. */
export function AutomationEffectFieldSummary({
  fieldLabel,
  labels,
  tones,
}: {
  fieldLabel: string;
  labels: string[];
  tones?: AutomationBadgeTone[];
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-sm font-semibold text-slate-900">{fieldLabel}</p>
      {labels.length > 0 ? (
        <AutomationValueBadges labels={labels} tones={tones} />
      ) : null}
    </div>
  );
}
