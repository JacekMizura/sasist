import type { WmsOperationalTaskDetailApi } from "../../../api/wmsOperationalTasksApi";
import type { OrderIssueTaskListItemApi } from "../../../api/wmsOrderIssueTasksApi";
import type { ExecutionActiveContext } from "../../../context/WarehouseExecutionContext";
import { brakiMixedStateSummary, resolveShortageLifecyclePhase } from "../../../pages/wms/brakiWorkflowCta";
import { readBrakiOperationalState } from "../../../pages/wms/readBrakiOperationalState";
import { priorityLabelForTask } from "../../../pages/wms/brakiPriority";
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

export { executionContextFromPicking } from "./pickingExecutionContext";

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

export function executionContextFromBrakiTask(
  task: OrderIssueTaskListItemApi,
  extras?: Partial<ExecutionActiveContext>,
): ExecutionActiveContext {
  const op = readBrakiOperationalState(task);
  const phase = resolveShortageLifecyclePhase(task);
  const stageLabel = op.workflow_stage || (task.braki_workflow_status_label ?? "").trim();

  return {
    operationType: "BRAKI WMS",
    orderNumber: formatOrderNumberLabel(task.order_number, task.order_id),
    brakiStageLabel: stageLabel,
    brakiWorkstreams: op.workstreams,
    shortageLifecyclePhase: phase,
    priorityLabel: priorityLabelForTask(task),
    currentStep: brakiMixedStateSummary(task),
    scanHint: "Zeskanuj zamówienie lub wybierz akcję poniżej",
    ...extras,
  };
}

/** Domyślny kontekst operacyjny gdy strona nie ustawiła setActiveContext. */
export function defaultExecutionContextForPath(pathname: string): ExecutionActiveContext {
  const p = pathname.replace(/\/+$/, "") || "/";

  if (p === "/wms/braki" || p === "/wms/issues" || p.startsWith("/wms/issues/")) {
    if (p.startsWith("/wms/issues/") && p !== "/wms/issues") {
      return {
        operationType: "BRAKI WMS",
        scanHint: "Zeskanuj zamówienie lub wybierz akcję",
        currentStep: "Szczegóły braków",
      };
    }
    return executionContextFromBrakiHub({
      scanHint: "Zeskanuj EAN lub numer zamówienia",
    });
  }
  if (p.includes("/picking/recovery/batch/")) {
    return {
      operationType: "DOGRYWKA BATCH",
      currentStep: "Grupowa dogrywka braków",
      scanHint: "Wybierz lokalizację lub zamówienie",
    };
  }
  if (p.includes("/picking/recovery/")) {
    return {
      operationType: "DOGRYWKA BRAKÓW",
      currentStep: "Zbierz brakującą ilość",
      scanHint: "Skanuj EAN produktu lub kod lokalizacji",
    };
  }
  if (p.includes("/operational-queues/relocation/") || p.includes("/relocation")) {
    return {
      operationType: "ROZLOKOWANIE PRODUKTÓW",
      currentStep: "Przypisz zebrane produkty do nośnika lub lokalizacji",
      scanHint: "Skanuj nośnik (PAL, BOX…) lub lokalizację docelową",
    };
  }
  if (p.includes("/packing/order/")) {
    return {
      operationType: "PAKOWANIE",
      currentStep: "Skanuj produkt do spakowania",
      scanHint: "Skanuj EAN — ilość rośnie automatycznie",
    };
  }
  if (p.includes("/operational-queues")) {
    return {
      operationType: "KOLEJKI OPERACYJNE",
      currentStep: "Wybierz zadanie magazynowe",
      scanHint: "Skanuj kod zadania lub zamówienia",
    };
  }
  if (p.includes("/picking/")) {
    return {
      operationType: "ZBIERANIE",
      currentStep: "Skanuj produkt lub lokalizację",
      scanHint: "Skanuj EAN produktu lub kod lokalizacji",
    };
  }
  return {
    operationType: "WMS",
    currentStep: "Operacja magazynowa",
    scanHint: "Skanuj kod kreskowy",
  };
}

export function executionContextFromBrakiHub(opts: {
  queueCount?: number;
  scanHint?: string;
}): ExecutionActiveContext {
  const count = opts.queueCount ?? 0;
  return {
    operationType: "BRAKI WMS",
    orderNumber: null,
    brakiStageLabel: "Kolejka braków",
    currentStep: count > 0 ? `${count} zamówień w kolejce` : "Brak otwartych zgłoszeń",
    scanHint: opts.scanHint ?? "Zeskanuj EAN lub numer zamówienia",
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
