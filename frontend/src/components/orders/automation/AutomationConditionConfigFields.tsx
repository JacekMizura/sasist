import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import type {
  AutomationCondition,
  AutomationConditionJoin,
  AutomationConditionOp,
} from "../../../types/orderAutomation";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import { FilterMultiSelect } from "../../filters/FilterMultiSelect";
import { PanelStatusHierarchyPicker } from "../../panel/PanelStatusHierarchyPicker";
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
import {
  oaInp,
  oaLbl,
  oaWorkflowFieldLabelClass,
  oaWorkflowFieldRowClass,
} from "./orderAutomationUiTokens";

export type AutomationConditionConfigFieldsProps = {
  condition: AutomationCondition;
  statusNameById: Map<number, string>;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  warehouseOptions: ConditionOption[];
  showJoin: boolean;
  joinToNext: AutomationConditionJoin;
  onPatch: (patch: Partial<AutomationCondition>) => void;
  onSetJoin: (join: AutomationConditionJoin) => void;
};

/** Pola konfiguracji warunku — wspólne dla inline (bez shella modalu). */
export function AutomationConditionConfigFields({
  condition,
  statusNameById,
  panelSummary,
  panelSubgroups,
  warehouseOptions,
  showJoin,
  joinToNext,
  onPatch,
  onSetJoin,
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

  const onFieldPick = (fieldKey: string) => {
    onPatch({
      fieldKey,
      operator: defaultOperatorForField(fieldKey),
      value: [],
    });
  };

  return (
    <>
      <div className="space-y-0">
        <div className={oaWorkflowFieldRowClass}>
          <span className={oaWorkflowFieldLabelClass}>Pole</span>
          <button
            type="button"
            className={`${oaInp} flex items-center justify-between text-left`}
            onClick={() => setFieldPickerOpen(true)}
          >
            <span className="truncate">{conditionFieldLabel(condition.fieldKey)}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </div>
        <div className={oaWorkflowFieldRowClass}>
          <span className={oaWorkflowFieldLabelClass}>Operator</span>
          <select
            className={oaInp}
            value={condition.operator}
            onChange={(e) => onPatch({ operator: e.target.value as AutomationConditionOp })}
          >
            {ops.map((op) => (
              <option key={op} value={op}>
                {ORDER_AUTOMATION_OPERATOR_UI[op] ?? op}
              </option>
            ))}
          </select>
        </div>
        <div className={oaWorkflowFieldRowClass}>
          <span className={oaWorkflowFieldLabelClass}>Wartość</span>
          <div className="min-w-0 space-y-2">
            {isOrderStatusField ? (
              <div className="rounded-lg border border-slate-200 bg-white">
                <PanelStatusHierarchyPicker
                  panelSummary={panelSummary}
                  panelSubgroups={panelSubgroups}
                  selectedStatusIds={selectedStatusIds}
                  showClearOption
                  clearLabel="Wyczyść zaznaczenie"
                  listMaxHeightClass="max-h-[min(40vh,16rem)]"
                  onSelectedIdsChange={(ids) => onPatch({ value: ids.map(String) })}
                />
              </div>
            ) : isMulti ? (
              <>
                <FilterMultiSelect
                  value={values}
                  onChange={(next) => onPatch({ value: next.map(String) })}
                  options={selectOptions}
                  placeholder="Wybierz wartości…"
                  emptySummary="Wybierz wartości…"
                  searchPlaceholder="Szukaj…"
                  totalOptionCount={selectOptions.length}
                />
                {selectedLabels.length > 0 ? (
                  <ul className="space-y-1 rounded-lg border border-slate-200 bg-white p-2">
                    {selectedLabels.map((label) => (
                      <li key={label} className="flex items-center gap-2 text-sm text-slate-800">
                        <span className="text-emerald-600" aria-hidden>
                          ✓
                        </span>
                        {label}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : meta?.valueKind === "number" ? (
              <input
                className={oaInp}
                type="number"
                value={values[0] ?? ""}
                placeholder="Wartość…"
                onChange={(e) => onPatch({ value: e.target.value.trim() ? [e.target.value.trim()] : [] })}
              />
            ) : (
              <input
                className={oaInp}
                value={values[0] ?? ""}
                placeholder="Wartość…"
                onChange={(e) => onPatch({ value: e.target.value.trim() ? [e.target.value.trim()] : [] })}
              />
            )}
          </div>
        </div>
        {showJoin ? (
          <label className={`${oaLbl} mt-3 block`}>
            Łącznik z następnym warunkiem
            <select
              className={`${oaInp} mt-1.5`}
              value={joinToNext}
              onChange={(e) => onSetJoin(e.target.value as AutomationConditionJoin)}
            >
              <option value="and">ORAZ</option>
              <option value="or">LUB</option>
            </select>
          </label>
        ) : null}
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
