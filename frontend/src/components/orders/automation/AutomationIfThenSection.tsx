import { ArrowRight, Copy, Pencil, Plus, Trash2 } from "lucide-react";

import type { AutomationCondition, AutomationConditionJoin, AutomationEffect } from "../../../types/orderAutomation";
import { formatConditionDisplayParts, formatEffectPill } from "../../../utils/orderAutomationPreview";
import { flatSectionDividerClass } from "../../layout/flatSectionTokens";
import {
  oaIconGhost,
  oaWorkflowAddCtaCondition,
  oaWorkflowAddCtaEffect,
  oaWorkflowCardActionsClass,
  oaWorkflowCardClass,
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
  summary: React.ReactNode;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

function WorkflowCard({ summary, onEdit, onDuplicate, onRemove }: WorkflowCardProps) {
  return (
    <div className={oaWorkflowCardClass} onClick={onEdit} onKeyDown={(e) => e.key === "Enter" && onEdit()} role="button" tabIndex={0}>
      <div className={oaWorkflowCardTitleClass}>{summary}</div>
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

      <div className="grid w-full min-w-0 max-w-none items-stretch gap-y-6 lg:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-0">
        <div className={oaWorkflowLaneClass}>
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
                  const parts = formatConditionDisplayParts(c, statusNameById);

                  return (
                    <li key={c.uid}>
                      <WorkflowCard
                        summary={
                          <>
                            {parts.field}{" "}
                            <span className="font-bold">{parts.op}</span>{" "}
                            {parts.value}
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

        <div className="flex items-center justify-center self-stretch px-1" aria-hidden>
          <div className={oaWorkflowFlowArrowClass}>
            <ArrowRight className="h-8 w-8 rotate-90 text-slate-500 lg:h-10 lg:w-10 lg:rotate-0" strokeWidth={2} />
          </div>
        </div>

        <div className={oaWorkflowLaneClass}>
          <div className="mb-4 flex items-center text-sm font-bold text-slate-700">
            <span className={oaWorkflowLaneBadgeClass}>To</span>
            Wykonaj akcje:
          </div>

          <div className="flex flex-1 flex-col gap-3">
            {effects.length > 0 ? (
              <ul className="space-y-2">
                {effects.map((e) => {
                  const summary = formatEffectPill(e, statusNameById);
                  return (
                    <li key={e.uid}>
                      <WorkflowCard
                        summary={summary}
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
