import type { WmsOperationalTaskDetailApi } from "../../../api/wmsOperationalTasksApi";
import { ActiveOperationContextBar } from "../execution/ActiveOperationContextBar";
import { executionContextFromOperationalDetail } from "../execution/syncExecutionContext";

type Props = {
  detail: WmsOperationalTaskDetailApi;
  sourceLabel?: string | null;
  targetLabel?: string | null;
  remainingQty?: number;
  operatorName?: string | null;
};

/** @deprecated Prefer global ExecutionGlobalContextBar + setActiveContext. */
export function ActiveWorkContextBar({ detail, sourceLabel, targetLabel, remainingQty, operatorName }: Props) {
  const ctx = executionContextFromOperationalDetail(detail, {
    sourceLocation: sourceLabel ?? undefined,
    targetLocation: targetLabel ?? undefined,
    remainingQty,
    operatorName: operatorName ?? undefined,
  });
  return <ActiveOperationContextBar context={ctx} />;
}
