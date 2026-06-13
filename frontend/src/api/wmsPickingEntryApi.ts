import api from "./axios";
import type { OrderUiMainGroup } from "../types/orderUiStatus";

/** Tryby z API ``GET /wms/picking/config`` (mapowanie z DB). */
export type PickingFlowMode = "cart_scan" | "cart_no_scan" | "baskets" | "mobile" | "consolidation_rack";
export type PickingFlowStrategy = "by_date" | "by_location";

/** Status panelu z rekordu ``picking_config`` — ``GET /wms/picking/configured-statuses`` */
export type WmsPickingConfiguredStatusItem = {
  source_status_id: number;
  status: string;
  color: string;
  main_group: OrderUiMainGroup;
  order_count: number;
  require_cart: boolean;
  cart_type: "BULK" | "BASKETS" | null;
};

export type WmsPickingPickUnit = "orders" | "products";
export type WmsPickingOrderSort = "date" | "location" | "courier";

export type WmsPickingFlowConfig = {
  source_status_id: number;
  target_status_id: number;
  /** Status panelu po zgłoszeniu braku — z konfiguracji zbierania (opcjonalnie). */
  status_on_shortage_id: number | null;
  single_mode: PickingFlowMode;
  multi_mode: PickingFlowMode;
  strategy: PickingFlowStrategy;
  pick_unit: WmsPickingPickUnit;
  order_sort: WmsPickingOrderSort;
  limits: { single: number | null; multi: number | null };
};

export async function getPickingConfiguredStatuses(
  tenantId: number,
  warehouseId: number,
): Promise<WmsPickingConfiguredStatusItem[]> {
  const res = await api.get<WmsPickingConfiguredStatusItem[]>("/wms/picking/configured-statuses", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

/** ``status`` = ``source_status_id`` (ID statusu panelu). */
export async function getWmsPickingFlowConfig(
  tenantId: number,
  warehouseId: number,
  sourceStatusId: number,
): Promise<WmsPickingFlowConfig> {
  const res = await api.get<WmsPickingFlowConfig>("/wms/picking/config", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      status: sourceStatusId,
    },
  });
  const d = res.data;
  return {
    ...d,
    status_on_shortage_id: d.status_on_shortage_id ?? null,
  };
}
