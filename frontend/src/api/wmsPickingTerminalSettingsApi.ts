/**
 * Warehouse picking terminal scan policy (SSOT: GET/POST /wms/settings/picking-terminal).
 * Uses shared `./axios` (Bearer interceptor) — same client as other WMS APIs.
 */
import api from "./axios";

/** Lista zbierania — widoczność pól na kafelkach produktów. */
export type WmsPickingListDisplayApi = {
  show_product_image: boolean;
  show_ean: boolean;
  show_sku: boolean;
  show_catalog_number: boolean;
  show_stock: boolean;
  show_location: boolean;
};

export const DEFAULT_WMS_PICKING_LIST_DISPLAY: WmsPickingListDisplayApi = {
  show_product_image: true,
  show_ean: true,
  show_sku: true,
  show_catalog_number: false,
  show_stock: true,
  show_location: true,
};

export type WmsPickingTerminalSettingsApi = {
  tenant_id: number;
  warehouse_id: number;
  require_product_scan_at_least_once: boolean;
  require_location_scan: boolean;
  disable_force_location_scan_when_many_locations: boolean;
  allow_reserve_location_picking: boolean;
  list_display: WmsPickingListDisplayApi;
};

export type WmsPickingTerminalSettingsSaveApi = {
  tenant_id: number;
  warehouse_id?: number | null;
  require_product_scan_at_least_once: boolean;
  require_location_scan: boolean;
  disable_force_location_scan_when_many_locations: boolean;
  allow_reserve_location_picking: boolean;
  list_display?: WmsPickingListDisplayApi | null;
};

export function normalizeWmsPickingListDisplay(
  raw: Partial<WmsPickingListDisplayApi> | null | undefined,
): WmsPickingListDisplayApi {
  return {
    show_product_image:
      raw?.show_product_image ?? DEFAULT_WMS_PICKING_LIST_DISPLAY.show_product_image,
    show_ean: raw?.show_ean ?? DEFAULT_WMS_PICKING_LIST_DISPLAY.show_ean,
    show_sku: raw?.show_sku ?? DEFAULT_WMS_PICKING_LIST_DISPLAY.show_sku,
    show_catalog_number:
      raw?.show_catalog_number ?? DEFAULT_WMS_PICKING_LIST_DISPLAY.show_catalog_number,
    show_stock: raw?.show_stock ?? DEFAULT_WMS_PICKING_LIST_DISPLAY.show_stock,
    show_location: raw?.show_location ?? DEFAULT_WMS_PICKING_LIST_DISPLAY.show_location,
  };
}

export async function getWmsPickingTerminalSettings(
  tenantId: number,
  warehouseId: number,
): Promise<WmsPickingTerminalSettingsApi> {
  // Relative path (no leading slash) joins with baseURL `/api/`.
  const res = await api.get<WmsPickingTerminalSettingsApi>("wms/settings/picking-terminal", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return {
    ...res.data,
    list_display: normalizeWmsPickingListDisplay(res.data?.list_display),
  };
}

export async function saveWmsPickingTerminalSettings(
  body: WmsPickingTerminalSettingsSaveApi,
): Promise<WmsPickingTerminalSettingsApi> {
  const res = await api.post<WmsPickingTerminalSettingsApi>("wms/settings/picking-terminal", body, {
    params:
      body.warehouse_id != null && body.warehouse_id > 0
        ? { warehouse_id: body.warehouse_id }
        : undefined,
  });
  return {
    ...res.data,
    list_display: normalizeWmsPickingListDisplay(res.data?.list_display),
  };
}
