import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

import type {
  AutomationCondition,
  AutomationConditionJoin,
  AutomationConditionOp,
} from "../../../types/orderAutomation";
import {
  ORDER_AUTOMATION_CONDITION_FIELDS,
  ORDER_AUTOMATION_OPERATOR_UI,
  buildConditionCategorySteps,
  conditionFieldLabel,
} from "../../../utils/orderAutomationCatalog";
import { formatConditionChipShort } from "../../../utils/orderAutomationPreview";
import { AutomationCategoryPickerModal } from "./AutomationCategoryPickerModal";
import { WmsOrderedStatusPopover } from "./WmsOrderedStatusPopover";
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
  ops: AutomationConditionOp[];
  statusNameById: Map<number, string>;
  tenantId: number;
  warehouseId: number;
  showJoin: boolean;
  joinToNext: AutomationConditionJoin;
  onClose: () => void;
  onPatch: (patch: Partial<AutomationCondition>) => void;
  onSetJoin: (join: AutomationConditionJoin) => void;
};

export function AutomationConditionEditModal({
  open,
  condition,
  ops,
  statusNameById,
  tenantId,
  warehouseId,
  showJoin,
  joinToNext,
  onClose,
  onPatch,
  onSetJoin,
}: Props) {
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusAnchorRef = useRef<HTMLButtonElement>(null);
  const categorySteps = useMemo(() => buildConditionCategorySteps(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !fieldPickerOpen && !statusOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, fieldPickerOpen, statusOpen]);

  if (!open || !condition) return null;

  const meta = ORDER_AUTOMATION_CONDITION_FIELDS.find((f) => f.key === condition.fieldKey);
  const stName =
    condition.fieldKey === "order_status" && condition.value && statusNameById.has(Number(condition.value))
      ? statusNameById.get(Number(condition.value))!
      : null;
  const summary = formatConditionChipShort(condition, statusNameById);
  const selectedStatusId = condition.fieldKey === "order_status" && condition.value ? Number(condition.value) : null;

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
          className="flex max-h-[min(88vh,32rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Warunek</p>
              <p className="truncate text-sm font-semibold text-slate-900">{summary}</p>
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
              <button type="button" className={`${oaInp} flex items-center justify-between text-left`} onClick={() => setFieldPickerOpen(true)}>
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
              {meta?.valueKind === "status" ? (
                <button
                  type="button"
                  ref={statusAnchorRef}
                  className={`${oaInp} text-left`}
                  onClick={() => setStatusOpen(true)}
                >
                  {stName ? <span className="truncate">{stName}</span> : <span className="text-slate-400">Wybierz status…</span>}
                </button>
              ) : (
                <input
                  className={oaInp}
                  value={condition.value}
                  placeholder="Wartość…"
                  onChange={(e) => onPatch({ value: e.target.value })}
                />
              )}
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
        onPick={(id) => onPatch({ fieldKey: id, value: "" })}
      />

      {statusOpen ? (
        <WmsOrderedStatusPopover
          open
          anchorRef={statusAnchorRef}
          tenantId={tenantId}
          warehouseId={warehouseId}
          selectedId={Number.isFinite(selectedStatusId!) ? selectedStatusId : null}
          onClose={() => setStatusOpen(false)}
          onSelect={(sid) => {
            onPatch({ value: String(sid) });
            setStatusOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
