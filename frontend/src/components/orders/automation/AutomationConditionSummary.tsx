import type { AutomationCondition } from "../../../types/orderAutomation";
import type { ConditionOption } from "../../../utils/orderAutomationConditionOptions";
import { formatConditionDisplayParts } from "../../../utils/orderAutomationPreview";
import {
  isMultiValueConditionField,
  migrateConditionValue,
} from "../../../utils/orderAutomationConditionUtils";
import { OrderUiStatusSelectedGroups } from "../OrderUiStatusSelectedGroups";
import { AutomationValueBadges, type AutomationBadgeTone } from "./AutomationValueBadges";
import {
  fallbackOrderUiStatusBrief,
  type OrderUiStatusBriefById,
} from "./buildOrderUiStatusNameById";

export type AutomationConditionSummaryProps = {
  condition: AutomationCondition;
  statusNameById?: Map<number, string>;
  statusBriefById?: OrderUiStatusBriefById;
  warehouseOptions?: ConditionOption[];
  fitToWidth?: boolean;
  /** Truncate non-badge text values (list). */
  truncateText?: boolean;
};

/** Shared condition summary: `Pole · operator` + badges / text (editor, list, history). */
export function AutomationConditionSummary({
  condition,
  statusNameById,
  statusBriefById,
  warehouseOptions,
  fitToWidth = true,
  truncateText = false,
}: AutomationConditionSummaryProps) {
  const parts = formatConditionDisplayParts(condition, statusNameById, warehouseOptions);
  const useBadges = isMultiValueConditionField(condition.fieldKey);
  const isOrderStatus = condition.fieldKey === "order_status";

  const orderStatusBriefs = isOrderStatus
    ? migrateConditionValue(condition.value).map((raw, index) => {
        const id = Number(raw);
        const label = parts.valueLabels[index] ?? statusNameById?.get(id) ?? String(raw);
        if (Number.isFinite(id) && id > 0) {
          return statusBriefById?.get(id) ?? fallbackOrderUiStatusBrief(id, label);
        }
        return fallbackOrderUiStatusBrief(0, label);
      })
    : [];

  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-sm leading-snug text-slate-900">
        <span className="font-semibold">{parts.field}</span>
        <span className="text-slate-300"> · </span>
        <span className="font-normal text-slate-600">{parts.op}</span>
      </p>
      {useBadges ? (
        parts.valueLabels.length > 0 ? (
          isOrderStatus ? (
            <OrderUiStatusSelectedGroups statuses={orderStatusBriefs} compact />
          ) : (
            <AutomationValueBadges labels={parts.valueLabels} fitToWidth={fitToWidth} />
          )
        ) : (
          <p className="text-sm text-slate-400">—</p>
        )
      ) : (
        <p
          className={`text-sm font-medium text-slate-800 ${truncateText ? "truncate" : ""}`}
          title={truncateText ? parts.value : undefined}
        >
          {parts.value}
        </p>
      )}
    </div>
  );
}

/** History / free-form: field label + value badges with optional diff tones. */
export function AutomationConditionFieldSummary({
  fieldLabel,
  operatorHint,
  labels,
  tones,
  fitToWidth = true,
}: {
  fieldLabel: string;
  /** e.g. "jest jednym z" when multi inferred */
  operatorHint?: string | null;
  labels: string[];
  tones?: AutomationBadgeTone[];
  fitToWidth?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-sm leading-snug text-slate-900">
        <span className="font-semibold">{fieldLabel}</span>
        {operatorHint ? (
          <>
            <span className="text-slate-300"> · </span>
            <span className="font-normal text-slate-600">{operatorHint}</span>
          </>
        ) : null}
      </p>
      {labels.length > 0 ? (
        <AutomationValueBadges labels={labels} tones={tones} fitToWidth={fitToWidth} />
      ) : (
        <p className="text-sm text-slate-400">—</p>
      )}
    </div>
  );
}
