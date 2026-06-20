import { ArrowRight, Copy, Pencil, Plus, Trash2 } from "lucide-react";

import type { AutomationCondition, AutomationConditionJoin, AutomationEffect } from "../../../types/orderAutomation";
import { formatConditionChipShort, formatEffectPill } from "../../../utils/orderAutomationPreview";
import { flatSectionDividerClass } from "../../layout/flatSectionTokens";
import { oaBtn, oaIconGhost, oaWorkflowSummaryCardClass } from "./orderAutomationUiTokens";

type ConditionJoinBadgeProps = {
  join: AutomationConditionJoin;
};

function ConditionJoinBadge({ join }: ConditionJoinBadgeProps) {
  return (
    <div className="flex justify-center py-0.5" aria-hidden>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {join === "or" ? "LUB" : "ORAZ"}
      </span>
    </div>
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
    <section className="w-full min-w-0 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Reguła</h2>
          <p className="mt-0.5 text-xs text-slate-500">Jeśli spełnione warunki → wykonaj akcje</p>
        </div>
      </div>
      <div className={flatSectionDividerClass} aria-hidden />

      <div className="grid w-full min-w-0 items-stretch gap-y-4 lg:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] lg:gap-x-8 lg:gap-y-0">
        {/* Jeśli */}
        <div className="flex min-h-full min-w-0 flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Jeśli</h3>
            <button type="button" className={`${oaBtn} h-7 gap-1 px-2 text-xs`} onClick={onAddCondition}>
              <Plus className="h-3.5 w-3.5" /> Dodaj
            </button>
          </div>

          <div className="flex min-h-[6rem] flex-1 flex-col">
            {conditions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                Brak warunków — reguła wykona się zawsze
              </p>
            ) : (
              <ul className="space-y-1">
                {conditions.map((c, idx) => {
                  const join = c.joinToNext ?? "and";
                  const isLast = idx >= conditions.length - 1;
                  const summary = formatConditionChipShort(c, statusNameById);

                  return (
                    <li key={c.uid}>
                      <div className={oaWorkflowSummaryCardClass}>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900" title={summary}>
                          {summary}
                        </span>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button type="button" className={`${oaIconGhost} h-7 w-7`} title="Edytuj" onClick={() => onEditCondition(c.uid)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" className={`${oaIconGhost} h-7 w-7`} title="Duplikuj" onClick={() => onDuplicateCondition(c)}>
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className={`${oaIconGhost} h-7 w-7 hover:text-red-600`}
                            title="Usuń"
                            onClick={() => onRemoveCondition(c.uid)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {!isLast ? <ConditionJoinBadge join={join} /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center self-stretch" aria-hidden>
          <ArrowRight className="h-10 w-10 shrink-0 rotate-90 text-slate-300 lg:rotate-0" strokeWidth={1.25} />
        </div>

        {/* To */}
        <div className="flex min-h-full min-w-0 flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">To</h3>
            <button type="button" className={`${oaBtn} h-7 gap-1 px-2 text-xs`} onClick={onAddEffect}>
              <Plus className="h-3.5 w-3.5" /> Dodaj
            </button>
          </div>

          <div className="flex min-h-[6rem] flex-1 flex-col">
            {effects.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                Dodaj co najmniej jedną akcję
              </p>
            ) : (
              <ul className="space-y-1">
                {effects.map((e) => {
                  const summary = formatEffectPill(e, statusNameById);
                  return (
                    <li key={e.uid}>
                      <div className={oaWorkflowSummaryCardClass}>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900" title={summary}>
                          {summary}
                        </span>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button type="button" className={`${oaIconGhost} h-7 w-7`} title="Edytuj" onClick={() => onEditEffect(e.uid)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" className={`${oaIconGhost} h-7 w-7`} title="Duplikuj" onClick={() => onDuplicateEffect(e)}>
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className={`${oaIconGhost} h-7 w-7 hover:text-red-600`}
                            title="Usuń"
                            onClick={() => onRemoveEffect(e.uid)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
