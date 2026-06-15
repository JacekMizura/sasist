/**
 * WMS workload refresh signal after active warehouse switch.
 * Project does not use React Query — pages refetch via `warehouse?.id` deps and/or this event.
 */
export const WMS_WAREHOUSE_CHANGED_EVENT = "wms:warehouse-changed";

export const WMS_WAREHOUSE_REFRESH_DOMAINS = [
  "receiving",
  "putaway",
  "picking",
  "packing",
  "inventory",
  "shortages",
  "operations",
  "quality",
  "production",
] as const;

export type WmsWarehouseRefreshDomain = (typeof WMS_WAREHOUSE_REFRESH_DOMAINS)[number];

export type WmsWarehouseChangedDetail = {
  warehouseId: number;
  domains: readonly WmsWarehouseRefreshDomain[];
};

export function buildWmsWarehouseChangedDetail(warehouseId: number): WmsWarehouseChangedDetail {
  return {
    warehouseId,
    domains: WMS_WAREHOUSE_REFRESH_DOMAINS,
  };
}

export function dispatchWmsWarehouseChanged(warehouseId: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WmsWarehouseChangedDetail>(WMS_WAREHOUSE_CHANGED_EVENT, {
      detail: buildWmsWarehouseChangedDetail(warehouseId),
    }),
  );
}
