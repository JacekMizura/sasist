/**
 * @deprecated Prefer `getProductionOperationalState` — ten plik zostaje jako cienki adapter.
 */
import {
  getProductionOperationalState,
  productionOrdersSourceSummary,
  resolveProductionSecondaryActions,
  type ProductionOperationalStateInput,
  type ProductionPrimaryActionKind,
  type ProductionSecondaryAction,
  type ProductionSecondaryActionId,
} from "./productionOperationalState";
import type { StatusTone } from "@/design-system";

export type ProductionNextActionKind = ProductionPrimaryActionKind;
export type { ProductionSecondaryAction, ProductionSecondaryActionId };
export type ProductionExecutionKindUi = "order" | "batch";
export type ProductionNextActionInput = ProductionOperationalStateInput;

export type ProductionNextAction = {
  kind: ProductionNextActionKind;
  label: string;
  contextMessage: string;
  tone: StatusTone;
  disabled?: boolean;
  disabledReason?: string;
  href?: string;
  openInNewTab?: boolean;
};

export function resolveProductionNextAction(input: ProductionNextActionInput): ProductionNextAction {
  const state = getProductionOperationalState(input);
  return {
    kind: state.primaryAction.kind,
    label: state.primaryAction.label,
    contextMessage: state.description,
    tone: state.tone,
    disabled: state.primaryAction.disabled,
    disabledReason: state.primaryAction.disabledReason,
    href: state.primaryAction.href,
    openInNewTab: state.primaryAction.openInNewTab,
  };
}

export { resolveProductionSecondaryActions, productionOrdersSourceSummary };

export function productionStageLabel(status: string | null | undefined): string {
  return getProductionOperationalState({
    executionKind: "order",
    id: 0,
    status: status || "draft",
  }).businessLabel;
}
