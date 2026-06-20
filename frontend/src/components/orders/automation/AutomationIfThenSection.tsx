import type { RefObject } from "react";
import { ArrowRight, Copy, Trash2 } from "lucide-react";

import type {
  AutomationCondition,
  AutomationConditionJoin,
  AutomationConditionOp,
  AutomationEffect,
} from "../../../types/orderAutomation";
import {
  ORDER_AUTOMATION_CONDITION_FIELDS,
  ORDER_AUTOMATION_OPERATOR_UI,
  conditionFieldLabel,
  effectKindLabel,
} from "../../../utils/orderAutomationCatalog";
import { formatConditionChipShort } from "../../../utils/orderAutomationPreview";
import { flatSectionDividerClass } from "../../layout/flatSectionTokens";
import { renderAutomationEffectConfigEditor } from "./effects/orderAutomationEffectEditorRenderers";
import {
  oaIconGhost,
  oaInp,
  oaWorkflowBlockBodyClass,
  oaWorkflowBlockClass,
  oaWorkflowBlockHeaderClass,
  oaWorkflowBlockTitleClass,
  oaWorkflowFieldLabelClass,
  oaWorkflowFieldRowClass,
} from "./orderAutomationUiTokens";

type LogicAddZoneProps = {
  variant: "condition" | "effect";
  label: string;
  hint: string;
  expanded: boolean;
  anchorRef?: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
};

function LogicAddZone({ variant, label, hint, expanded, anchorRef, onClick }: LogicAddZoneProps) {
  const tone =
    variant === "condition"
      ? "border-sky-200/90 hover:border-sky-300 hover:bg-sky-50/40"
      : "border-emerald-200/90 hover:border-emerald-300 hover:bg-emerald-50/40";
  const plusTone = variant === "condition" ? "text-sky-500" : "text-emerald-500";

  return (
    <button
      type="button"
      ref={anchorRef}
      onClick={onClick}
      className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed bg-white px-4 text-center transition ${tone} ${expanded ? "min-h-[10rem] flex-1 py-10" : "py-5"}`}
    >
      <span className={`text-2xl font-light leading-none ${plusTone}`}>+</span>
      <span className="text-sm font-medium text-slate-900">{label}</span>
      {expanded ? <span className="max-w-xs text-xs text-slate-500">{hint}</span> : null}
    </button>
  );
}

type ConditionJoinProps = {
  join: AutomationConditionJoin;
  onChange: (join: AutomationConditionJoin) => void;
};

function ConditionJoinDivider({ join, onChange }: ConditionJoinProps) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-gray-200" aria-hidden />
      <select
        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 outline-none focus:border-slate-400"
        value={join}
        onChange={(e) => onChange(e.target.value as AutomationConditionJoin)}
        aria-label="Łącznik warunków"
      >
        <option value="and">ORAZ</option>
        <option value="or">LUB</option>
      </select>
      <div className="h-px flex-1 bg-gray-200" aria-hidden />
    </div>
  );
}

export type AutomationIfThenSectionProps = {
  conditions: AutomationCondition[];
  effects: AutomationEffect[];
  ops: AutomationConditionOp[];
  statusNameById: Map<number, string>;
  panelStatusOptions: { id: number; name: string }[];
  condAddRef: RefObject<HTMLButtonElement | null>;
  effAddRef: RefObject<HTMLButtonElement | null>;
  onOpenCondMenu: () => void;
  onOpenEffMenu: () => void;
  onOpenConditionField: (uid: string, anchor: HTMLElement) => void;
  onOpenEffectKind: (uid: string, anchor: HTMLElement) => void;
  onOpenStatus: (el: HTMLElement, uid: string) => void;
  onPatchConditionOperator: (uid: string, operator: AutomationConditionOp) => void;
  onPatchConditionValue: (uid: string, value: string) => void;
  onSetJoinToNext: (conditionUid: string, join: AutomationConditionJoin) => void;
  onDuplicateCondition: (c: AutomationCondition) => void;
  onRemoveCondition: (uid: string) => void;
  onDuplicateEffect: (e: AutomationEffect) => void;
  onRemoveEffect: (uid: string) => void;
  onPatchEffectPayload: (uid: string, partial: Record<string, string | number | boolean | null>) => void;
};

export function AutomationIfThenSection({
  conditions,
  effects,
  ops,
  statusNameById,
  panelStatusOptions,
  condAddRef,
  effAddRef,
  onOpenCondMenu,
  onOpenEffMenu,
  onOpenConditionField,
  onOpenEffectKind,
  onOpenStatus,
  onPatchConditionOperator,
  onPatchConditionValue,
  onSetJoinToNext,
  onDuplicateCondition,
  onRemoveCondition,
  onDuplicateEffect,
  onRemoveEffect,
  onPatchEffectPayload,
}: AutomationIfThenSectionProps) {
  return (
    <section className="w-full min-w-0 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Jeśli → To</h2>
        <p className="mt-1 text-sm text-slate-500">Spełnione warunki po lewej — wykonywane akcje po prawej.</p>
      </div>
      <div className={flatSectionDividerClass} aria-hidden />

      <div className="grid w-full min-w-0 items-stretch gap-y-6 lg:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-0">
        {/* Jeśli */}
        <div className="flex min-h-full min-w-0 flex-col">
          <div className="mb-4 shrink-0">
            <h3 className="text-base font-semibold text-slate-900">Jeśli</h3>
            <p className="mt-0.5 text-sm text-slate-500">Warunki muszą być spełnione</p>
          </div>

          <div className="flex min-h-[14rem] flex-1 flex-col">
            {conditions.length > 0 ? (
              <ul className="mb-4 flex-1 space-y-3">
                {conditions.map((c, idx) => {
                  const meta = ORDER_AUTOMATION_CONDITION_FIELDS.find((f) => f.key === c.fieldKey);
                  const stName =
                    c.fieldKey === "order_status" && c.value && statusNameById.has(Number(c.value))
                      ? statusNameById.get(Number(c.value))!
                      : null;
                  const join = c.joinToNext ?? "and";
                  const isLast = idx >= conditions.length - 1;
                  const summary = formatConditionChipShort(c, statusNameById);

                  return (
                    <li key={c.uid}>
                      <article className={oaWorkflowBlockClass}>
                        <div className={oaWorkflowBlockHeaderClass}>
                          <p className={oaWorkflowBlockTitleClass}>{summary}</p>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button type="button" className={oaIconGhost} title="Duplikuj warunek" onClick={() => onDuplicateCondition(c)}>
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className={`${oaIconGhost} hover:text-red-600`}
                              title="Usuń warunek"
                              onClick={() => onRemoveCondition(c.uid)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className={oaWorkflowBlockBodyClass}>
                          <div className={oaWorkflowFieldRowClass}>
                            <span className={oaWorkflowFieldLabelClass}>Pole</span>
                            <button
                              type="button"
                              className={`${oaInp} text-left`}
                              onClick={(e) => onOpenConditionField(c.uid, e.currentTarget)}
                            >
                              <span className="truncate">{conditionFieldLabel(c.fieldKey)}</span>
                            </button>
                          </div>
                          <div className={oaWorkflowFieldRowClass}>
                            <span className={oaWorkflowFieldLabelClass}>Operator</span>
                            <select
                              className={oaInp}
                              value={c.operator}
                              onChange={(e) => onPatchConditionOperator(c.uid, e.target.value as AutomationConditionOp)}
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
                                className={`${oaInp} text-left`}
                                onClick={(e) => onOpenStatus(e.currentTarget, c.uid)}
                              >
                                {stName ? <span className="truncate">{stName}</span> : <span className="text-slate-400">Wybierz…</span>}
                              </button>
                            ) : (
                              <input
                                className={oaInp}
                                value={c.value}
                                placeholder="Wartość…"
                                onChange={(e) => onPatchConditionValue(c.uid, e.target.value)}
                              />
                            )}
                          </div>
                        </div>
                      </article>
                      {!isLast ? <ConditionJoinDivider join={join} onChange={(j) => onSetJoinToNext(c.uid, j)} /> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex-1" aria-hidden />
            )}

            <div className={conditions.length > 0 ? "mt-auto shrink-0" : "flex flex-1 flex-col"}>
              <LogicAddZone
                variant="condition"
                label="Dodaj warunek"
                hint="Przeciągnij pola, aby zbudować warunek"
                expanded={conditions.length === 0}
                anchorRef={condAddRef}
                onClick={onOpenCondMenu}
              />
            </div>
          </div>
        </div>

        {/* Strzałka przepływu */}
        <div className="flex items-center justify-center self-stretch px-1 lg:min-h-[14rem]" aria-hidden>
          <ArrowRight className="h-12 w-12 shrink-0 rotate-90 text-slate-300 lg:rotate-0" strokeWidth={1.25} />
        </div>

        {/* To */}
        <div className="flex min-h-full min-w-0 flex-col">
          <div className="mb-4 shrink-0">
            <h3 className="text-base font-semibold text-slate-900">To</h3>
            <p className="mt-0.5 text-sm text-slate-500">Akcje wykonywane po spełnieniu warunków</p>
          </div>

          <div className="flex min-h-[14rem] flex-1 flex-col">
            {effects.length > 0 ? (
              <ul className="mb-4 flex-1 space-y-3">
                {effects.map((e) => {
                  const title = effectKindLabel(e.kind);

                  return (
                    <li key={e.uid}>
                      <article className={oaWorkflowBlockClass}>
                        <div className={oaWorkflowBlockHeaderClass}>
                          <button
                            type="button"
                            className={`${oaWorkflowBlockTitleClass} text-left hover:text-slate-700`}
                            onClick={(ev) => onOpenEffectKind(e.uid, ev.currentTarget)}
                          >
                            {title}
                          </button>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button type="button" className={oaIconGhost} title="Duplikuj akcję" onClick={() => onDuplicateEffect(e)}>
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className={`${oaIconGhost} hover:text-red-600`}
                              title="Usuń akcję"
                              onClick={() => onRemoveEffect(e.uid)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className={oaWorkflowBlockBodyClass}>
                          {renderAutomationEffectConfigEditor({
                            kind: e.kind,
                            effect: e,
                            statusOptions: panelStatusOptions,
                            patchPayload: (partial) => onPatchEffectPayload(e.uid, partial),
                          })}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex-1" aria-hidden />
            )}

            <div className={effects.length > 0 ? "mt-auto shrink-0" : "flex flex-1 flex-col"}>
              <LogicAddZone
                variant="effect"
                label="Dodaj akcję"
                hint="Przeciągnij akcję, aby ją dodać"
                expanded={effects.length === 0}
                anchorRef={effAddRef}
                onClick={onOpenEffMenu}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
