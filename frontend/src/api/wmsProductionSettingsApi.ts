import api from "./axios";
import { DAMAGE_TENANT_ID } from "../pages/damage/damageShared";

export type ProductionTerminalDisplaySettings = {
  show_product_image: boolean;
  show_name: boolean;
  show_sku: boolean;
  show_ean: boolean;
  show_catalog_number: boolean;
  show_source_location: boolean;
  show_target_location: boolean;
  show_stock_level: boolean;
  show_unit: boolean;
  show_barcode: boolean;
};

export type ProductionTerminalRequiredSettings = {
  require_batch_number: boolean;
  require_serial: boolean;
  require_lot: boolean;
  require_production_date: boolean;
  require_expiry_date: boolean;
  require_operator: boolean;
  require_quality_control: boolean;
};

export type ProductionForecastSettings = {
  strategy: "PERIOD_AVERAGE" | "WEIGHTED_AVERAGE" | "WEEKDAY_AVERAGE";
  sales_lookback_days: number;
  auto_stock_replenishment?: boolean;
  stock_replenishment_coverage_days?: 1 | 3 | 7 | 14;
  stock_replenishment_interval?: "hourly" | "every_3_hours" | "every_6_hours" | "daily";
  last_replenishment_run_at?: string | null;
  last_replenishment_run_summary?: Record<string, unknown> | null;
};

export type ProductionReservationSettings = {
  allocation_strategy: "FIFO" | "FEFO" | "LIFO";
  allow_sales_locations: boolean;
};

export type ProductionTraceabilitySettings = {
  mode: "OFF" | "CONFIGURED";
  require_batch: boolean;
  require_serial: boolean;
  require_expiry: boolean;
};

export type WmsProductionSettings = {
  tenant_id: number;
  warehouse_id: number;
  terminal_display: ProductionTerminalDisplaySettings;
  terminal_required: ProductionTerminalRequiredSettings;
  forecast: ProductionForecastSettings;
  reservation: ProductionReservationSettings;
  traceability?: ProductionTraceabilitySettings;
};

export type WmsProductionSettingsSave = {
  tenant_id: number;
  warehouse_id?: number | null;
  terminal_display: ProductionTerminalDisplaySettings;
  terminal_required: ProductionTerminalRequiredSettings;
  forecast?: ProductionForecastSettings;
  reservation?: ProductionReservationSettings;
  traceability?: ProductionTraceabilitySettings;
};

export async function getWmsProductionSettings(params?: {
  tenantId?: number;
  warehouseId?: number;
}): Promise<WmsProductionSettings> {
  const res = await api.get<WmsProductionSettings>("/wms/settings/production", {
    params: {
      tenant_id: params?.tenantId ?? DAMAGE_TENANT_ID,
      ...(params?.warehouseId != null && params.warehouseId > 0 ? { warehouse_id: params.warehouseId } : {}),
    },
  });
  return res.data;
}

export async function saveWmsProductionSettings(body: WmsProductionSettingsSave): Promise<WmsProductionSettings> {
  const res = await api.put<WmsProductionSettings>("/wms/settings/production", body);
  return res.data;
}
