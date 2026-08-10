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
  /** Zamówienia dostępne do rozpoczęcia zbierania. */
  order_count: number;
  /** Aktywne zbieranie innych operatorów. */
  in_progress_by_others?: number;
  /** Aktywne zbieranie zalogowanego operatora. */
  in_progress_by_me?: number;
  require_cart: boolean;
  cart_type: "BULK" | "BASKETS" | null;
  /** Kod wózka operatora (tylko gdy require_cart i wózek przypisany). */
  active_cart_code?: string | null;
  /** Nazwa/identyfikator wózka do badge na kafelku. */
  active_cart_name?: string | null;
  active_cart_id?: number | null;
  active_cart_type?: "BULK" | "BASKETS" | null;
  /** Produkty z aktywnej sesji (SSOT jak lista produktów). */
  session_products_picked?: number;
  session_products_total?: number;
  active_session_id?: number | null;
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

export type WmsPickingOrderTypeHubSlice = {
  order_count: number;
  products_picked: number;
  products_total: number;
};

export type WmsPickingOrderTypeHub = {
  source_status_id: number;
  single: WmsPickingOrderTypeHubSlice;
  multi: WmsPickingOrderTypeHubSlice;
  all: WmsPickingOrderTypeHubSlice;
  /** Tryb aktualnie zbierany przez operatora (otwarta sesja). */
  active_order_type?: "single" | "multi" | "all" | null;
};

/** Liczniki ekranu „Wybierz” — single / multi / all. */
export async function getWmsPickingOrderTypeHub(
  tenantId: number,
  warehouseId: number,
  sourceStatusId: number,
): Promise<WmsPickingOrderTypeHub> {
  const res = await api.get<WmsPickingOrderTypeHub>("/wms/picking/order-type-hub", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      status: sourceStatusId,
    },
  });
  return res.data;
}
