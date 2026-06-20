import { AlertTriangle, ArrowRight, Copy, Pencil, Plus, Trash2 } from "lucide-react";

import type { AutomationCondition, AutomationConditionJoin, AutomationEffect } from "../../../types/orderAutomation";
import { formatConditionDisplayParts, formatEffectListBlock } from "../../../utils/orderAutomationPreview";
import type { ConditionOption } from "../../../utils/orderAutomationConditionOptions";
import { conditionErrorTitle, effectErrorTitle } from "../../../utils/orderAutomationValidation";
import { flatSectionDividerClass } from "../../layout/flatSectionTokens";
import {
  oaIconGhost,
  oaWorkflowAddCtaCondition,
  oaWorkflowAddCtaEffect,
  oaWorkflowCardActionsClass,
  oaWorkflowCardTitleClass,
  oaWorkflowFlowArrowClass,
  oaWorkflowLaneBadgeClass,
  oaWorkflowLaneClass,
} from "./orderAutomationUiTokens";

type ConditionJoinBadgeProps = {
  join: AutomationConditionJoin;
};

function ConditionJoinBadge({ join }: ConditionJoinBadgeProps) {
  return (
    <div className="flex justify-center py-1.5" aria-hidden>
      <span className="rounded border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
        {join === "or" ? "LUB" : "ORAZ"}
      </span>
    </div>
  );
}

type WorkflowCardProps = {
  title: string;
  summary: React.ReactNode;
  errorMessage?: string | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

function WorkflowCard({ title, summary, errorMessage, onEdit, onDuplicate, onRemove }: WorkflowCardProps) {
  const hasError = Boolean(errorMessage);

  return (
    <div
      className={`group/card relative flex w-full min-h-14 cursor-pointer flex-col rounded-lg border-2 bg-white px-4 py-3 text-left transition ${
        hasError ? "border-red-300 hover:border-red-400" : "border-slate-200 hover:border-slate-400"
      }`}
      onClick={onEdit}
      onKeyDown={(e) => e.key === "Enter" && onEdit()}
      role="button"
      tabIndex={0}
    >
      <div className="flex min-w-0 items-start gap-2 pr-16">
        {hasError ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden /> : null}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <div className={`${oaWorkflowCardTitleClass} mt-0.5 whitespace-normal pr-0`}>{summary}</div>
          {hasError ? <p className="mt-1 text-xs text-red-600">{errorMessage}</p> : null}
        </div>
      </div>
      <div className={oaWorkflowCardActionsClass} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={`${oaIconGhost} h-8 w-8`} title="Edytuj" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </button>
        <button type="button" className={`${oaIconGhost} h-8 w-8`} title="Duplikuj" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </button>
        <button type="button" className={`${oaIconGhost} h-8 w-8 hover:text-red-600`} title="Usuń" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

type WorkflowAddCtaProps = {
  variant: "condition" | "effect";
  label: string;
  onClick: () => void;
};

function WorkflowAddCta({ variant, label, onClick }: WorkflowAddCtaProps) {
  const cls = variant === "condition" ? oaWorkflowAddCtaCondition : oaWorkflowAddCtaEffect;
  return (
    <button type="button" className={cls} onClick={onClick}>
      <Plus className="h-5 w-5 shrink-0" strokeWidth={2} />
      {label}
    </button>
  );
}

export type AutomationIfThenSectionProps = {
  conditions: AutomationCondition[];
  effects: AutomationEffect[];
  statusNameById: Map<number, string>;
  warehouseOptions?: ConditionOption[];
  conditionErrors?: Record<string, string>;
  effectErrors?: Record<string, string>;
  onAddCondition: () => void;
  onAddEffect: () => void;
  onEditCondition: (uid: string) => void;
  onEditEffect: (uid: string) => void;
  onDuplicateCondition: (c: AutomationCondition) => void;
  onRemoveCondition: (uid: string) => void;
  onDuplicateEffect: (e: AutomationEffect) => void;
  onRemoveEffect: (uid: string) => void;
};

export function AutomationIfThenSection({
  conditions,
  effects,
  statusNameById,
  warehouseOptions = [],
  conditionErrors = {},
  effectErrors = {},
  onAddCondition,
  onAddEffect,
  onEditCondition,
  onEditEffect,
  onDuplicateCondition,
  onRemoveCondition,
  onDuplicateEffect,
  onRemoveEffect,
}: AutomationIfThenSectionProps) {
  return (
    <section className="w-full min-w-0 max-w-none space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Reguły automatyzacji</h2>
        <p className="mt-0.5 text-sm text-slate-600">Kliknij kartę, aby edytować warunek lub akcję.</p>
      </div>
      <div className={flatSectionDividerClass} aria-hidden />

      <div className="grid w-full min-w-0 max-w-none items-stretch gap-y-6 lg:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] lg:gap-x-6 lg:gap-y-0">
        {/* JEŚLI — lewa kolumna */}
        <div className={`${oaWorkflowLaneClass} min-w-0`}>
          <div className="mb-4 flex items-center text-sm font-bold text-slate-700">
            <span className={oaWorkflowLaneBadgeClass}>Jeśli</span>
            Spełnione są warunki:
          </div>

          <div className="flex flex-1 flex-col gap-3">
            {conditions.length > 0 ? (
              <ul className="space-y-2">
                {conditions.map((c, idx) => {
                  const join = c.joinToNext ?? "and";
                  const isLast = idx >= conditions.length - 1;
                  const parts = formatConditionDisplayParts(c, statusNameById, warehouseOptions);
                  const err = conditionErrors[c.uid] ?? null;

                  return (
                    <li key={c.uid}>
                      <WorkflowCard
                        title={conditionErrorTitle(c)}
                        errorMessage={err}
                        summary={
                          <>
                            {parts.field}{" "}
                            <span className="font-semibold">
                              {parts.op} {parts.value}
                            </span>
                          </>
                        }
                        onEdit={() => onEditCondition(c.uid)}
                        onDuplicate={() => onDuplicateCondition(c)}
                        onRemove={() => onRemoveCondition(c.uid)}
                      />
                      {!isLast ? <ConditionJoinBadge join={join} /> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className={conditions.length > 0 ? "mt-auto" : "flex-1"}>
              <WorkflowAddCta variant="condition" label="Dodaj warunek" onClick={onAddCondition} />
            </div>
          </div>
        </div>

        {/* Strzałka — wyśrodkowana pionowo; pozioma na desktopie, pionowa na mobile */}
        <div className="flex items-center justify-center self-stretch px-1" aria-hidden>
          <div className={oaWorkflowFlowArrowClass}>
            <ArrowRight
              className="h-8 w-8 rotate-90 text-slate-500 lg:h-10 lg:w-10 lg:rotate-0"
              strokeWidth={2}
            />
          </div>
        </div>

        {/* TO — prawa kolumna */}
        <div className={`${oaWorkflowLaneClass} min-w-0`}>
          <div className="mb-4 flex items-center text-sm font-bold text-slate-700">
            <span className={oaWorkflowLaneBadgeClass}>To</span>
            Wykonaj akcje:
          </div>

          <div className="flex flex-1 flex-col gap-3">
            {effects.length > 0 ? (
              <ul className="space-y-2">
                {effects.map((e) => {
                  const block = formatEffectListBlock(e, statusNameById);
                  const hasDetail = block.primaryBold || block.secondaryDetail;
                  const err = effectErrors[e.uid] ?? null;

                  return (
                    <li key={e.uid}>
                      <WorkflowCard
                        title={effectErrorTitle(e)}
                        errorMessage={err}
                        summary={
                          <>
                            <span className="block font-medium text-slate-900">{block.title}</span>
                            {hasDetail ? (
                              <span className="mt-0.5 block text-sm font-normal text-slate-700">
                                {block.detailPrefix}
                                {block.primaryBold ? (
                                  <span className="font-semibold">{block.primaryBold}</span>
                                ) : null}
                                {block.secondaryDetail}
                              </span>
                            ) : null}
                          </>
                        }
                        onEdit={() => onEditEffect(e.uid)}
                        onDuplicate={() => onDuplicateEffect(e)}
                        onRemove={() => onRemoveEffect(e.uid)}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className={effects.length > 0 ? "mt-auto" : "flex-1"}>
              <WorkflowAddCta variant="effect" label="Dodaj akcję" onClick={onAddEffect} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
