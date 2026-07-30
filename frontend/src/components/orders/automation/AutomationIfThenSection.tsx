import { AlertTriangle, ArrowRight, Check, Copy, Pencil, Plus, Trash2 } from "lucide-react";

import type { AutomationCondition, AutomationConditionJoin, AutomationEffect, AutomationEffectKind } from "../../../types/orderAutomation";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import type { ConditionOption } from "../../../utils/orderAutomationConditionOptions";
import {
  formatConditionDisplayParts,
  formatEffectListBlock,
} from "../../../utils/orderAutomationPreview";
import { effectKindLabel } from "../../../utils/orderAutomationCatalog";
import { IconButton } from "../../../design-system/components/Button/IconButton";
import { AutomationConditionConfigFields } from "./AutomationConditionConfigFields";
import { AutomationEffectConfigFields } from "./AutomationEffectConfigFields";
import {
  oaBtnPri,
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

function RowActions({
  onEdit,
  onDuplicate,
  onRemove,
  editActive,
}: {
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  editActive?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton
        aria-label={editActive ? "Zakończ edycję" : "Edytuj"}
        aria-pressed={editActive}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        <Pencil className="h-4 w-4" strokeWidth={2} />
      </IconButton>
      <IconButton
        aria-label="Duplikuj"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate();
        }}
      >
        <Copy className="h-4 w-4" strokeWidth={2} />
      </IconButton>
      <IconButton
        aria-label="Usuń"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Trash2 className="h-4 w-4" strokeWidth={2} />
      </IconButton>
    </div>
  );
}

function ConditionSummary({
  condition,
  statusNameById,
  warehouseOptions,
}: {
  condition: AutomationCondition;
  statusNameById: Map<number, string>;
  warehouseOptions: ConditionOption[];
}) {
  const parts = formatConditionDisplayParts(condition, statusNameById, warehouseOptions);
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-sm font-semibold text-slate-900">{parts.field}</p>
      <p className="text-sm text-slate-500">{parts.op}</p>
      {parts.valueLabels.length > 0 ? (
        <ul className="space-y-0.5">
          {parts.valueLabels.map((label) => (
            <li key={label} className="text-sm font-medium text-slate-800">
              {label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">—</p>
      )}
    </div>
  );
}

function EffectSummary({
  effect,
  statusNameById,
}: {
  effect: AutomationEffect;
  statusNameById: Map<number, string>;
}) {
  const block = formatEffectListBlock(effect, statusNameById);
  const title = effectKindLabel(effect.kind);
  const primary = block.primaryBold ?? block.secondaryDetail;
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {primary ? <p className="text-sm font-medium text-slate-800">{primary}</p> : <p className="text-sm text-slate-400">—</p>}
      {block.secondaryDetail && block.primaryBold ? (
        <p className="text-sm text-slate-500">{block.secondaryDetail}</p>
      ) : null}
    </div>
  );
}

/** Krótka animacja wysokości expand/collapse (~180ms). */
const expandShellClass =
  "grid transition-[grid-template-rows] duration-[180ms] ease-out motion-reduce:transition-none";

type ConditionRowProps = {
  condition: AutomationCondition;
  expanded: boolean;
  statusNameById: Map<number, string>;
  warehouseOptions: ConditionOption[];
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  showJoin: boolean;
  errorMessage?: string | null;
  onToggleEdit: () => void;
  onFinishEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<AutomationCondition>) => void;
  onSetJoin: (join: AutomationConditionJoin) => void;
};

function ConditionRow({
  condition,
  expanded,
  statusNameById,
  warehouseOptions,
  panelSummary,
  panelSubgroups,
  showJoin,
  errorMessage,
  onToggleEdit,
  onFinishEdit,
  onDuplicate,
  onRemove,
  onPatch,
  onSetJoin,
}: ConditionRowProps) {
  return (
    <div className="space-y-1">
      <div
        className={`rounded-lg border bg-white ${errorMessage ? "border-red-300" : "border-slate-200"}`}
      >
        <div className="flex items-start gap-2 px-3 py-2.5">
          {errorMessage ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden /> : null}
          <div className="min-w-0 flex-1">
            {!expanded ? (
              <ConditionSummary
                condition={condition}
                statusNameById={statusNameById}
                warehouseOptions={warehouseOptions}
              />
            ) : (
              <p className="text-sm font-semibold text-slate-900">Edycja warunku</p>
            )}
          </div>
          <RowActions
            editActive={expanded}
            onEdit={onToggleEdit}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
          />
        </div>

        <div className={`${expandShellClass} ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="min-h-0 overflow-hidden">
            {expanded ? (
              <div className="border-t border-slate-100 px-3 pb-3 pt-2">
                <AutomationConditionConfigFields
                  condition={condition}
                  statusNameById={statusNameById}
                  panelSummary={panelSummary}
                  panelSubgroups={panelSubgroups}
                  warehouseOptions={warehouseOptions}
                  showJoin={showJoin}
                  joinToNext={condition.joinToNext ?? "and"}
                  onPatch={onPatch}
                  onSetJoin={onSetJoin}
                />
                <div className="mt-3 flex justify-end">
                  <button type="button" className={`${oaBtnPri} gap-1.5`} onClick={onFinishEdit}>
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    Zakończ edycję
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {errorMessage ? <p className="px-1 text-xs text-red-600">{errorMessage}</p> : null}
    </div>
  );
}

type EffectRowProps = {
  effect: AutomationEffect;
  expanded: boolean;
  statusNameById: Map<number, string>;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  errorMessage?: string | null;
  onToggleEdit: () => void;
  onFinishEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onChangeKind: (kind: AutomationEffectKind) => void;
  onPatchPayload: (partial: Record<string, string | number | boolean | null>) => void;
};

function EffectRow({
  effect,
  expanded,
  statusNameById,
  panelSummary,
  panelSubgroups,
  errorMessage,
  onToggleEdit,
  onFinishEdit,
  onDuplicate,
  onRemove,
  onChangeKind,
  onPatchPayload,
}: EffectRowProps) {
  return (
    <div className="space-y-1">
      <div
        className={`rounded-lg border bg-white ${errorMessage ? "border-red-300" : "border-slate-200"}`}
      >
        <div className="flex items-start gap-2 px-3 py-2.5">
          {errorMessage ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden /> : null}
          <div className="min-w-0 flex-1">
            {!expanded ? (
              <EffectSummary effect={effect} statusNameById={statusNameById} />
            ) : (
              <p className="text-sm font-semibold text-slate-900">Edycja akcji</p>
            )}
          </div>
          <RowActions
            editActive={expanded}
            onEdit={onToggleEdit}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
          />
        </div>

        <div className={`${expandShellClass} ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="min-h-0 overflow-hidden">
            {expanded ? (
              <div className="border-t border-slate-100 px-3 pb-3 pt-2">
                <AutomationEffectConfigFields
                  effect={effect}
                  panelSummary={panelSummary}
                  panelSubgroups={panelSubgroups}
                  onChangeKind={onChangeKind}
                  onPatchPayload={onPatchPayload}
                />
                <div className="mt-3 flex justify-end">
                  <button type="button" className={`${oaBtnPri} gap-1.5`} onClick={onFinishEdit}>
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    Zakończ edycję
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {errorMessage ? <p className="px-1 text-xs text-red-600">{errorMessage}</p> : null}
    </div>
  );
}

function WorkflowAddCta({
  variant,
  label,
  onClick,
}: {
  variant: "condition" | "effect";
  label: string;
  onClick: () => void;
}) {
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
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  conditionErrors?: Record<string, string>;
  effectErrors?: Record<string, string>;
  expandedConditionUid: string | null;
  expandedEffectUid: string | null;
  onAddCondition: () => void;
  onAddEffect: () => void;
  onExpandCondition: (uid: string | null) => void;
  onExpandEffect: (uid: string | null) => void;
  onPatchCondition: (uid: string, patch: Partial<AutomationCondition>) => void;
  onSetConditionJoin: (uid: string, join: AutomationConditionJoin) => void;
  onChangeEffectKind: (uid: string, kind: AutomationEffectKind) => void;
  onPatchEffectPayload: (uid: string, partial: Record<string, string | number | boolean | null>) => void;
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
  panelSummary,
  panelSubgroups,
  conditionErrors = {},
  effectErrors = {},
  expandedConditionUid,
  expandedEffectUid,
  onAddCondition,
  onAddEffect,
  onExpandCondition,
  onExpandEffect,
  onPatchCondition,
  onSetConditionJoin,
  onChangeEffectKind,
  onPatchEffectPayload,
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
                  const expanded = expandedConditionUid === c.uid;
                  return (
                    <li key={c.uid}>
                      <ConditionRow
                        condition={c}
                        expanded={expanded}
                        statusNameById={statusNameById}
                        warehouseOptions={warehouseOptions}
                        panelSummary={panelSummary}
                        panelSubgroups={panelSubgroups}
                        showJoin={!isLast}
                        errorMessage={conditionErrors[c.uid] ?? null}
                        onToggleEdit={() => onExpandCondition(expanded ? null : c.uid)}
                        onFinishEdit={() => onExpandCondition(null)}
                        onDuplicate={() => onDuplicateCondition(c)}
                        onRemove={() => onRemoveCondition(c.uid)}
                        onPatch={(patch) => onPatchCondition(c.uid, patch)}
                        onSetJoin={(j) => onSetConditionJoin(c.uid, j)}
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
                {effects.map((e) => {
                  const expanded = expandedEffectUid === e.uid;
                  return (
                    <li key={e.uid}>
                      <EffectRow
                        effect={e}
                        expanded={expanded}
                        statusNameById={statusNameById}
                        panelSummary={panelSummary}
                        panelSubgroups={panelSubgroups}
                        errorMessage={effectErrors[e.uid] ?? null}
                        onToggleEdit={() => onExpandEffect(expanded ? null : e.uid)}
                        onFinishEdit={() => onExpandEffect(null)}
                        onDuplicate={() => onDuplicateEffect(e)}
                        onRemove={() => onRemoveEffect(e.uid)}
                        onChangeKind={(kind) => onChangeEffectKind(e.uid, kind)}
                        onPatchPayload={(partial) => onPatchEffectPayload(e.uid, partial)}
                      />
                    </li>
                  );
                })}
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
