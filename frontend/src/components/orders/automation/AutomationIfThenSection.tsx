import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, MoreVertical, Plus, X } from "lucide-react";

import type { AutomationCondition, AutomationConditionJoin, AutomationEffect } from "../../../types/orderAutomation";
import type { ConditionOption } from "../../../utils/orderAutomationConditionOptions";
import {
  formatConditionDisplayParts,
  formatEffectListBlock,
} from "../../../utils/orderAutomationPreview";
import { IconButton } from "../../../design-system/components/Button/IconButton";
import {
  oaWorkflowAddCtaCondition,
  oaWorkflowAddCtaEffect,
  oaWorkflowFlowArrowClass,
  oaWorkflowLaneBadgeIfClass,
  oaWorkflowLaneBadgeThenClass,
  oaWorkflowLaneClass,
} from "./orderAutomationUiTokens";

type ConditionJoinBadgeProps = {
  join: AutomationConditionJoin;
};

function ConditionJoinBadge({ join }: ConditionJoinBadgeProps) {
  return (
    <div className="flex justify-center py-1" aria-hidden>
      <span className="rounded border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
        {join === "or" ? "LUB" : "ORAZ"}
      </span>
    </div>
  );
}

function FakeSelect({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`inline-flex h-10 min-w-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 transition hover:border-slate-300 ${className}`}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="shrink-0 text-slate-400" aria-hidden>
        ▾
      </span>
    </button>
  );
}

function ValueChips({
  labels,
  onOpen,
}: {
  labels: string[];
  onOpen: () => void;
}) {
  if (labels.length === 0) {
    return (
      <FakeSelect className="min-w-[8rem] flex-1 text-slate-400" onClick={onOpen}>
        Wybierz…
      </FakeSelect>
    );
  }
  return (
    <button
      type="button"
      className="inline-flex h-10 min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white px-2 text-left transition hover:border-slate-300"
      onClick={onOpen}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {labels.map((label) => (
          <span
            key={label}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"
          >
            {label}
            <X className="h-3 w-3 text-slate-400" aria-hidden />
          </span>
        ))}
      </span>
      <span className="shrink-0 pr-1 text-slate-400" aria-hidden>
        ▾
      </span>
    </button>
  );
}

function RowMenu({
  onEdit,
  onDuplicate,
  onRemove,
}: {
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <IconButton
        aria-label="Więcej akcji"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreVertical className="h-4 w-4" />
      </IconButton>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[9rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {(
            [
              { label: "Edytuj", run: onEdit },
              { label: "Duplikuj", run: onDuplicate },
              { label: "Usuń", run: onRemove, danger: true },
            ] as const
          ).map((item) => (
            <button
              key={item.label}
              type="button"
              className={`flex w-full px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                "danger" in item && item.danger ? "text-red-600" : "text-slate-800"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ConditionRowProps = {
  condition: AutomationCondition;
  statusNameById: Map<number, string>;
  warehouseOptions: ConditionOption[];
  errorMessage?: string | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

function ConditionRow({
  condition,
  statusNameById,
  warehouseOptions,
  errorMessage,
  onEdit,
  onDuplicate,
  onRemove,
}: ConditionRowProps) {
  const parts = formatConditionDisplayParts(condition, statusNameById, warehouseOptions);
  return (
    <div className="space-y-1">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 ${
          errorMessage ? "border-red-300" : "border-slate-200"
        }`}
      >
        {errorMessage ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-hidden /> : null}
        <FakeSelect className="min-w-[9rem] sm:max-w-[12rem]" onClick={onEdit}>
          {parts.field}
        </FakeSelect>
        <FakeSelect className="min-w-[7.5rem] sm:max-w-[10rem]" onClick={onEdit}>
          {parts.op}
        </FakeSelect>
        <ValueChips labels={parts.valueLabels} onOpen={onEdit} />
        <RowMenu onEdit={onEdit} onDuplicate={onDuplicate} onRemove={onRemove} />
      </div>
      {errorMessage ? <p className="px-1 text-xs text-red-600">{errorMessage}</p> : null}
    </div>
  );
}

type EffectRowProps = {
  effect: AutomationEffect;
  statusNameById: Map<number, string>;
  errorMessage?: string | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

function EffectRow({ effect, statusNameById, errorMessage, onEdit, onDuplicate, onRemove }: EffectRowProps) {
  const block = formatEffectListBlock(effect, statusNameById);
  const kindLabel = block.leadIn.replace(/\s+$/, "") || "Akcja";
  const valueLabel = block.primaryBold || block.secondaryDetail || "—";
  return (
    <div className="space-y-1">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 ${
          errorMessage ? "border-red-300" : "border-slate-200"
        }`}
      >
        {errorMessage ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-hidden /> : null}
        <FakeSelect className="min-w-[9rem] flex-1 sm:max-w-[14rem]" onClick={onEdit}>
          {kindLabel}
        </FakeSelect>
        <FakeSelect className="min-w-[8rem] flex-1" onClick={onEdit}>
          {valueLabel}
        </FakeSelect>
        <RowMenu onEdit={onEdit} onDuplicate={onDuplicate} onRemove={onRemove} />
      </div>
      {errorMessage ? <p className="px-1 text-xs text-red-600">{errorMessage}</p> : null}
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
      <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
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
        <p className="mt-1 text-sm text-slate-500">
          Skonfiguruj warunki brzegowe oraz akcje, które mają zostać wykonane.
        </p>
      </div>

      <div className="grid w-full min-w-0 max-w-none items-stretch gap-y-6 lg:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] lg:gap-x-4 lg:gap-y-0">
        <div className={`${oaWorkflowLaneClass} min-w-0`}>
          <div className="mb-4 flex flex-wrap items-center gap-y-1 text-sm font-medium text-slate-700">
            <span className={oaWorkflowLaneBadgeIfClass}>JEŚLI</span>
            Spełnione są wszystkie warunki:
          </div>

          <div className="flex flex-1 flex-col gap-3">
            {conditions.length > 0 ? (
              <ul className="space-y-2">
                {conditions.map((c, idx) => {
                  const join = c.joinToNext ?? "and";
                  const isLast = idx >= conditions.length - 1;
                  return (
                    <li key={c.uid}>
                      <ConditionRow
                        condition={c}
                        statusNameById={statusNameById}
                        warehouseOptions={warehouseOptions}
                        errorMessage={conditionErrors[c.uid] ?? null}
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

            <div className={conditions.length > 0 ? "mt-auto pt-1" : "flex-1"}>
              <WorkflowAddCta variant="condition" label="Dodaj warunek" onClick={onAddCondition} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center self-stretch px-1" aria-hidden>
          <div className={oaWorkflowFlowArrowClass}>
            <ArrowRight
              className="h-6 w-6 rotate-90 text-slate-400 lg:h-7 lg:w-7 lg:rotate-0"
              strokeWidth={2}
            />
          </div>
        </div>

        <div className={`${oaWorkflowLaneClass} min-w-0`}>
          <div className="mb-4 flex flex-wrap items-center gap-y-1 text-sm font-medium text-slate-700">
            <span className={oaWorkflowLaneBadgeThenClass}>TO</span>
            Wykonaj akcje:
          </div>

          <div className="flex flex-1 flex-col gap-3">
            {effects.length > 0 ? (
              <ul className="space-y-2">
                {effects.map((e) => (
                  <li key={e.uid}>
                    <EffectRow
                      effect={e}
                      statusNameById={statusNameById}
                      errorMessage={effectErrors[e.uid] ?? null}
                      onEdit={() => onEditEffect(e.uid)}
                      onDuplicate={() => onDuplicateEffect(e)}
                      onRemove={() => onRemoveEffect(e.uid)}
                    />
                  </li>
                ))}
              </ul>
            ) : null}

            <div className={effects.length > 0 ? "mt-auto pt-1" : "flex-1"}>
              <WorkflowAddCta variant="effect" label="Dodaj akcję" onClick={onAddEffect} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
