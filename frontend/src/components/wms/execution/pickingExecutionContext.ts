import type { ExecutionActiveContext } from "../../../context/WarehouseExecutionContext";
import { WMS_UI } from "../../../pages/wms/wmsTerminology";
import { formatOrderNumberLabel, formatPickingToolLabel } from "./activeOperationContext";

/** Picking/recovery execution context — no braki workflow imports. */
export function executionContextFromPicking(opts: {
  recoveryOrderId?: number | null;
  orderNumber?: string | null;
  cartCode?: string | null;
  cartName?: string | null;
  sourceLocation?: string | null;
  remainingQty?: number;
  remainingLines?: number;
  currentStep?: string;
  operatorName?: string | null;
  scanHint?: string;
}): ExecutionActiveContext {
  const isRecovery = opts.recoveryOrderId != null && opts.recoveryOrderId > 0;
  const orderNumber =
    formatOrderNumberLabel(opts.orderNumber, opts.recoveryOrderId) ??
    (isRecovery ? formatOrderNumberLabel(null, opts.recoveryOrderId) : null);
  const pickingToolLabel = formatPickingToolLabel(opts.cartCode, opts.cartName);
  const rem =
    opts.remainingQty ??
    (opts.remainingLines != null && opts.remainingLines > 0 ? opts.remainingLines : undefined);

  let currentStep = opts.currentStep;
  if (!currentStep) {
    if (isRecovery) currentStep = "Zbierz brakującą ilość";
    else currentStep = "Skanuj produkt lub lokalizację";
  }

  return {
    operationType: isRecovery ? "DOGRYWKA BRAKÓW" : "ZBIERANIE",
    orderNumber,
    pickingToolLabel,
    sourceLocation: opts.sourceLocation ?? null,
    remainingQty: rem,
    currentStep,
    operatorName: opts.operatorName,
    scanHint: opts.scanHint ?? "Skanuj EAN produktu lub kod lokalizacji",
    taskLabel: isRecovery ? WMS_UI.recoveryPickFull : "Zbieranie",
    stepLabel: currentStep,
    locationLabel: opts.sourceLocation ?? undefined,
  };
}
