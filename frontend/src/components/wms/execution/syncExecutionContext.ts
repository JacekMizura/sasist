import type { WmsOperationalTaskDetailApi } from "../../../api/wmsOperationalTasksApi";
import type { ExecutionActiveContext } from "../../../context/WarehouseExecutionContext";
import { nextOperationalAction, taskTypeLabel } from "../operational/operationalWorkflow";
import { formatCartLabel, formatOrderNumberLabel } from "./activeOperationContext";

export function executionContextFromOperationalDetail(
  detail: WmsOperationalTaskDetailApi,
  extras?: Partial<ExecutionActiveContext>,
): ExecutionActiveContext {
  const next = nextOperationalAction(detail);
  const rem =
    extras?.remainingQty ??
    Math.max(0, (detail.quantity_required || 0) - (detail.quantity_done || 0));
  const orderNumber = formatOrderNumberLabel(detail.order_number, detail.order_id);
  const source = detail.picked_from_location ?? detail.location_hint ?? null;
  const target =
    extras?.targetLocation ??
    extras?.carrierLabel ??
    detail.relocation_session?.active_carrier_label ??
    (detail.task_type === "RELOCATION" ? "NOŚNIK" : null);

  return {
    operationType: taskTypeLabel(detail.task_type).toUpperCase(),
    orderNumber,
    cartLabel: source,
    sourceLocation: source,
    targetLocation: target,
    remainingQty: rem,
    currentStep: next.label,
    operatorName: detail.relocation_session?.operator_name ?? extras?.operatorName,
    scanHint: next.scanHint,
    taskLabel: taskTypeLabel(detail.task_type),
    productName: detail.product_name,
    productSku: detail.product_sku ?? detail.product_ean ?? undefined,
    carrierLabel: target ?? undefined,
    locationLabel: source ?? undefined,
    stepLabel: next.label,
    ...extras,
  };
}

export function executionContextFromPicking(opts: {
  recoveryOrderId?: number | null;
  orderNumber?: string | null;
  cartCode?: string | null;
  cartName?: string | null;
  sourceLocation?: string | null;
  targetLocation?: string | null;
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
  const cartLabel = formatCartLabel(opts.cartCode, opts.cartName);
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
    cartLabel,
    sourceLocation: opts.sourceLocation ?? null,
    targetLocation: opts.targetLocation ?? cartLabel ?? "WÓZEK",
    remainingQty: rem,
    currentStep,
    operatorName: opts.operatorName,
    scanHint: opts.scanHint ?? "Skanuj EAN produktu lub kod lokalizacji",
    taskLabel: isRecovery ? "Dogrywka zbierki" : "Zbieranie",
    stepLabel: currentStep,
    carrierLabel: cartLabel ?? undefined,
    locationLabel: opts.sourceLocation ?? undefined,
  };
}

export function executionContextFromPutaway(opts: {
  documentLabel?: string | null;
  sourceLocation?: string | null;
  targetLocation?: string | null;
  remainingQty?: number;
  currentStep?: string;
  operatorName?: string | null;
  scanHint?: string;
}): ExecutionActiveContext {
  return {
    operationType: "ROZLOKOWANIE PZ",
    cartLabel: opts.documentLabel ?? null,
    sourceLocation: opts.sourceLocation ?? null,
    targetLocation: opts.targetLocation ?? "LOKALIZACJA",
    remainingQty: opts.remainingQty,
    currentStep: opts.currentStep ?? "Skanuj lokalizację docelową",
    operatorName: opts.operatorName,
    scanHint: opts.scanHint ?? "Lokalizacja → EAN → nośnik",
    taskLabel: "Rozlokowanie PZ",
    stepLabel: opts.currentStep,
  };
}

export function executionContextFromPacking(opts: {
  orderNumber?: string | null;
  orderId?: number;
  cartCode?: string | null;
  cartName?: string | null;
  remainingQty?: number;
  currentStep?: string;
  operatorName?: string | null;
  targetLocation?: string | null;
  scanHint?: string;
}): ExecutionActiveContext {
  const orderNumber = formatOrderNumberLabel(opts.orderNumber, opts.orderId);
  const cartLabel = formatCartLabel(opts.cartCode, opts.cartName);

  return {
    operationType: "PAKOWANIE",
    orderNumber,
    cartLabel,
    sourceLocation: cartLabel,
    targetLocation: opts.targetLocation ?? "KARTON",
    remainingQty: opts.remainingQty,
    currentStep: opts.currentStep ?? "Skanuj produkt do spakowania",
    operatorName: opts.operatorName,
    scanHint: opts.scanHint ?? "Skanuj EAN — ilość rośnie automatycznie",
    taskLabel: "Pakowanie",
    stepLabel: opts.currentStep,
    carrierLabel: opts.targetLocation ?? undefined,
  };
}
