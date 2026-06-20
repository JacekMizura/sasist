import { AlertTriangle, Copy, Pencil, Plus, Trash2 } from "lucide-react";

import type { AutomationCondition, AutomationConditionJoin, AutomationEffect } from "../../../types/orderAutomation";
import { formatConditionDisplayParts, formatEffectListBlock } from "../../../utils/orderAutomationPreview";
import { conditionErrorTitle, effectErrorTitle } from "../../../utils/orderAutomationValidation";
import { flatSectionDividerClass } from "../../layout/flatSectionTokens";
import {
  oaIconGhost,
  oaWorkflowAddCtaCondition,
  oaWorkflowAddCtaEffect,
  oaWorkflowCardActionsClass,
  oaWorkflowCardTitleClass,
  oaWorkflowLaneBadgeClass,
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
    <div className="w-full min-w-0 max-w-none space-y-8">
      <section className="w-full space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            <span className={oaWorkflowLaneBadgeClass}>Jeśli</span>
            Warunki
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">Reguła uruchamia się, gdy wszystkie warunki są spełnione.</p>
        </div>
        <div className={flatSectionDividerClass} aria-hidden />

        <div className="flex flex-col gap-3">
          {conditions.length > 0 ? (
            <ul className="space-y-2">
              {conditions.map((c, idx) => {
                const join = c.joinToNext ?? "and";
                const isLast = idx >= conditions.length - 1;
                const parts = formatConditionDisplayParts(c, statusNameById);
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
          <WorkflowAddCta variant="condition" label="Dodaj warunek" onClick={onAddCondition} />
        </div>
      </section>

      <section className="w-full space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            <span className={oaWorkflowLaneBadgeClass}>To</span>
            Efekty
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">Akcje wykonywane po spełnieniu warunków.</p>
        </div>
        <div className={flatSectionDividerClass} aria-hidden />

        <div className="flex flex-col gap-3">
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
                              {block.primaryBold ? <span className="font-semibold">{block.primaryBold}</span> : null}
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
          <WorkflowAddCta variant="effect" label="Dodaj akcję" onClick={onAddEffect} />
        </div>
      </section>
    </div>
  );
}
