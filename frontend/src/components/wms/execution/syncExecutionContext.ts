import type { WmsOperationalTaskDetailApi } from "../../../api/wmsOperationalTasksApi";
import type { ExecutionActiveContext } from "../../../context/WarehouseExecutionContext";
import {
  mapRelocationModeToTargetType,
  WMS_UI,
} from "../../../pages/wms/wmsTerminology";
import { nextOperationalAction, taskTypeLabel } from "../operational/operationalWorkflow";
import { formatOrderNumberLabel, formatPickingToolLabel } from "./activeOperationContext";

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

  const isRelocation = detail.task_type === "RELOCATION";
  const relocationMode = detail.relocation_mode;
  const relocationTargetType =
    extras?.relocationTargetType ??
    (isRelocation ? mapRelocationModeToTargetType(relocationMode ?? "CARRIER") : null);
  const targetLabel =
    extras?.targetLocation ??
    extras?.carrierLabel ??
    detail.relocation_session?.active_carrier_label ??
    null;

  return {
    operationType: taskTypeLabel(detail.task_type).toUpperCase(),
    orderNumber,
    sourceLocation: source,
    relocationTargetType: isRelocation ? relocationTargetType : null,
    targetLocation: isRelocation ? targetLabel : extras?.targetLocation ?? null,
    remainingQty: rem,
    currentStep: next.label,
    operatorName: detail.relocation_session?.operator_name ?? extras?.operatorName,
    scanHint: next.scanHint,
    taskLabel: taskTypeLabel(detail.task_type),
    productName: detail.product_name,
    productSku: detail.product_sku ?? detail.product_ean ?? undefined,
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

export function executionContextFromPutaway(opts: {
  documentLabel?: string | null;
  sourceLocation?: string | null;
  targetLocation?: string | null;
  targetType?: "LOCATION" | "CARRIER_UNIT";
  remainingQty?: number;
  currentStep?: string;
  operatorName?: string | null;
  scanHint?: string;
}): ExecutionActiveContext {
  const targetType = opts.targetType ?? "LOCATION";
  return {
    operationType: "ROZLOKOWANIE PZ",
    sourceLocation: opts.sourceLocation ?? null,
    relocationTargetType: targetType,
    targetLocation: opts.targetLocation ?? (targetType === "LOCATION" ? "—" : null),
    remainingQty: opts.remainingQty,
    currentStep: opts.currentStep ?? "Skanuj lokalizację docelową",
    operatorName: opts.operatorName,
    scanHint: opts.scanHint ?? "Lokalizacja docelowa lub nośnik logistyczny (PAL, BOX…)",
    taskLabel: WMS_UI.putawayPz,
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
  packagingLabel?: string | null;
  scanHint?: string;
}): ExecutionActiveContext {
  const orderNumber = formatOrderNumberLabel(opts.orderNumber, opts.orderId);
  const pickingToolLabel = formatPickingToolLabel(opts.cartCode, opts.cartName);

  return {
    operationType: "PAKOWANIE",
    orderNumber,
    pickingToolLabel: pickingToolLabel ?? undefined,
    packagingLabel: opts.packagingLabel ?? null,
    remainingQty: opts.remainingQty,
    currentStep: opts.currentStep ?? "Skanuj produkt do spakowania",
    operatorName: opts.operatorName,
    scanHint: opts.scanHint ?? "Skanuj EAN — ilość rośnie automatycznie",
    taskLabel: "Pakowanie",
    stepLabel: opts.currentStep,
  };
}
