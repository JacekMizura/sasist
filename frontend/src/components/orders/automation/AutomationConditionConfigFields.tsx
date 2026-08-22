import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { AutomationCondition, AutomationConditionOp } from "../../../types/orderAutomation";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import { FilterMultiSelect } from "../../filters/FilterMultiSelect";
import {
  ORDER_AUTOMATION_CONDITION_FIELDS,
  ORDER_AUTOMATION_OPERATOR_UI,
  buildConditionCategorySteps,
  conditionFieldLabel,
} from "../../../utils/orderAutomationCatalog";
import {
  conditionOptionsForField,
  resolveOptionLabels,
  type ConditionOption,
} from "../../../utils/orderAutomationConditionOptions";
import {
  defaultOperatorForField,
  defaultOperatorsForField,
  isMultiValueConditionField,
  migrateConditionValue,
} from "../../../utils/orderAutomationConditionUtils";
import { AutomationCategoryPickerModal } from "./AutomationCategoryPickerModal";
import { OrderUiStatusField } from "../OrderUiStatusField";
import { AutomationValueBadges } from "./AutomationValueBadges";
import { Input } from "../../../design-system";

const sentenceTriggerClass =
  "inline-flex h-8 max-w-full min-w-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-medium text-slate-900 transition hover:border-slate-300";

export type AutomationConditionConfigFieldsProps = {
  condition: AutomationCondition;
  statusNameById: Map<number, string>;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  warehouseOptions: ConditionOption[];
  onPatch: (patch: Partial<AutomationCondition>) => void;
};

export function AutomationConditionConfigFields({
  condition,
  statusNameById,
  panelSummary,
  panelSubgroups,
  warehouseOptions,
  onPatch,
}: AutomationConditionConfigFieldsProps) {
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const categorySteps = useMemo(() => buildConditionCategorySteps(), []);

  const statusOptions = useMemo(() => {
    const out: ConditionOption[] = [];
    for (const [id, name] of statusNameById) {
      out.push({ value: String(id), label: name });
    }
    return out.sort((a, b) => a.label.localeCompare(b, "pl"));
  }, [statusNameById]);

  const selectOptions = useMemo(
    () =>
      conditionOptionsForField(condition.fieldKey, {
        statusOptions,
        warehouseOptions,
      }),
    [condition.fieldKey, statusOptions, warehouseOptions],
  );

  const meta = ORDER_AUTOMATION_CONDITION_FIELDS.find((f) => f.key === condition.fieldKey);
  const isMulti = isMultiValueConditionField(condition.fieldKey);
  const isOrderStatusField = condition.fieldKey === "order_status";
  const values = migrateConditionValue(condition.value);
  const ops = defaultOperatorsForField(condition.fieldKey);
  const selectedLabels = resolveOptionLabels(values, selectOptions);
  const selectedStatusIds = values.map((v) => Number(v)).filter((id) => Number.isFinite(id) && id > 0);
  const opLabel = ORDER_AUTOMATION_OPERATOR_UI[condition.operator] ?? condition.operator;

  const onFieldPick = (fieldKey: string) => {
    onPatch({
      fieldKey,
      operator: defaultOperatorForField(fieldKey),
      value: [],
    });
  };

  const removeValueAt = (index: number) => {
    const next = values.filter((_, i) => i !== index);
    onPatch({ value: next });
  };

  return (
    <>
      <div className="space-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <button type="button" className={sentenceTriggerClass} onClick={() => setFieldPickerOpen(true)}>
            <span className="min-w-0 truncate">{conditionFieldLabel(condition.fieldKey)}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </button>
          <span className="text-slate-300" aria-hidden>
            ·
          </span>
          <label className="relative inline-flex min-w-0">
            <span className={`${sentenceTriggerClass} pr-7 font-normal text-slate-600`}>
              <span className="truncate">{opLabel}</span>
            </span>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <select
              className="absolute inset-0 cursor-pointer opacity-0"
              value={condition.operator}
              aria-label="Operator"
              onChange={(e) => onPatch({ operator: e.target.value as AutomationConditionOp })}
            >
              {ops.map((op) => (
                <option key={op} value={op}>
                  {ORDER_AUTOMATION_OPERATOR_UI[op] ?? op}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isMulti && !isOrderStatusField && selectedLabels.length > 0 ? (
          <AutomationValueBadges labels={selectedLabels} removable onRemove={removeValueAt} />
        ) : null}

        {isOrderStatusField ? (
          <OrderUiStatusField
            panelSummary={panelSummary}
            panelSubgroups={panelSubgroups}
            statusNameById={statusNameById}
            selectedStatusIds={selectedStatusIds}
            placeholder="Wybierz statusy…"
            onSelectedIdsChange={(ids) => onPatch({ value: ids.map(String) })}
          />
        ) : isMulti ? (
          <FilterMultiSelect
            value={values}
            onChange={(next) => onPatch({ value: next.map(String) })}
            options={selectOptions}
            placeholder="Dodaj wartości…"
            emptySummary="Dodaj wartości…"
            searchPlaceholder="Szukaj…"
            totalOptionCount={selectOptions.length}
          />
        ) : meta?.valueKind === "number" ? (
          <Input
            density="compact"
            type="number"
            value={values[0] ?? ""}
            placeholder="Wartość…"
            onChange={(e) => onPatch({ value: e.target.value.trim() ? [e.target.value.trim()] : [] })}
          />
        ) : (
          <Input
            density="compact"
            value={values[0] ?? ""}
            placeholder="Wartość…"
            onChange={(e) => onPatch({ value: e.target.value.trim() ? [e.target.value.trim()] : [] })}
          />
        )}
      </div>

      <AutomationCategoryPickerModal
        open={fieldPickerOpen}
        title="Wybierz pole"
        categories={categorySteps}
        onClose={() => setFieldPickerOpen(false)}
        onPick={(id) => {
          onFieldPick(id);
          setFieldPickerOpen(false);
        }}
      />
    </>
  );
}
