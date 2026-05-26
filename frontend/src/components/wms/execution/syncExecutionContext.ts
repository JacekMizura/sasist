import type { WmsOperationalTaskDetailApi } from "../../../api/wmsOperationalTasksApi";
import type { ExecutionActiveContext } from "../../../context/WarehouseExecutionContext";
import { nextOperationalAction } from "../operational/operationalWorkflow";

export function executionContextFromOperationalDetail(
  detail: WmsOperationalTaskDetailApi,
  extras?: Partial<ExecutionActiveContext>,
): ExecutionActiveContext {
  const next = nextOperationalAction(detail);
  const rem = Math.max(0, (detail.quantity_required || 0) - (detail.quantity_done || 0));
  return {
    taskLabel: detail.task_type.replace(/_/g, " "),
    productName: detail.product_name,
    productSku: detail.product_sku ?? detail.product_ean ?? undefined,
    carrierLabel: detail.relocation_session?.active_carrier_label ?? extras?.carrierLabel,
    locationLabel: detail.picked_from_location ?? detail.location_hint ?? extras?.locationLabel,
    remainingQty: rem,
    stepLabel: next.label,
    scanHint: next.scanHint,
    ...extras,
  };
}
