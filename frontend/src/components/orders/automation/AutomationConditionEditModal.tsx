import { useEffect, useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";

import type {
  AutomationCondition,
  AutomationConditionJoin,
  AutomationConditionOp,
} from "../../../types/orderAutomation";
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
import { formatConditionDisplayParts } from "../../../utils/orderAutomationPreview";
import { AutomationCategoryPickerModal } from "./AutomationCategoryPickerModal";
import {
  oaBtn,
  oaBtnPri,
  oaInp,
  oaLbl,
  oaWorkflowFieldLabelClass,
  oaWorkflowFieldRowClass,
} from "./orderAutomationUiTokens";

type Props = {
  open: boolean;
  condition: AutomationCondition | null;
  statusNameById: Map<number, string>;
  warehouseOptions: ConditionOption[];
  showJoin: boolean;
  joinToNext: AutomationConditionJoin;
  onClose: () => void;
  onPatch: (patch: Partial<AutomationCondition>) => void;
  onSetJoin: (join: AutomationConditionJoin) => void;
};

export function AutomationConditionEditModal({
  open,
  condition,
  statusNameById,
  warehouseOptions,
  showJoin,
  joinToNext,
  onClose,
  onPatch,
  onSetJoin,
}: Props) {
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const categorySteps = useMemo(() => buildConditionCategorySteps(), []);

  const statusOptions = useMemo(() => {
    const out: ConditionOption[] = [];
    for (const [id, name] of statusNameById) {
      out.push({ value: String(id), label: name });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, "pl"));
  }, [statusNameById]);

  const selectOptions = useMemo(() => {
    if (!condition) return [];
    return conditionOptionsForField(condition.fieldKey, {
      statusOptions,
      warehouseOptions,
    });
  }, [condition, statusOptions, warehouseOptions]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !fieldPickerOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, fieldPickerOpen]);

  if (!open || !condition) return null;

  const meta = ORDER_AUTOMATION_CONDITION_FIELDS.find((f) => f.key === condition.fieldKey);
  const isMulti = isMultiValueConditionField(condition.fieldKey);
  const values = migrateConditionValue(condition.value);
  const ops = defaultOperatorsForField(condition.fieldKey);
  const summary = formatConditionDisplayParts(condition, statusNameById, warehouseOptions);
  const selectedLabels = resolveOptionLabels(values, selectOptions);

  const onFieldPick = (fieldKey: string) => {
    onPatch({
      fieldKey,
      operator: defaultOperatorForField(fieldKey),
      value: [],
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal
        aria-label="Edytuj warunek"
        onClick={onClose}
      >
        <div
          className="flex max-h-[min(88vh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Warunek</p>
              <p className="truncate text-sm font-semibold text-slate-900">
                {summary.field} {summary.op} {summary.value}
              </p>
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
                {isMulti ? (
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
              <label className={`${oaLbl} mt-4 block`}>
                Łącznik z następnym warunkiem
                <select
                  className={`${oaInp} mt-1`}
                  value={joinToNext}
                  onChange={(e) => onSetJoin(e.target.value as AutomationConditionJoin)}
                >
                  <option value="and">ORAZ</option>
                  <option value="or">LUB</option>
                </select>
              </label>
            ) : null}
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
        open={fieldPickerOpen}
        title="Wybierz pole"
        categories={categorySteps}
        onClose={() => setFieldPickerOpen(false)}
        onPick={onFieldPick}
      />
    </>
  );
}
