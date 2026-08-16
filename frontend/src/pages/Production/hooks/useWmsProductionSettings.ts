import { useCallback, useEffect, useState } from "react";

import {
  getWmsProductionSettings,
  type ProductionTerminalDisplaySettings,
  type ProductionTraceabilitySettings,
  type WmsProductionSettings,
} from "@/api/wmsProductionSettingsApi";
import { useWarehouse } from "@/context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "@/pages/damage/damageShared";

const DEFAULT_DISPLAY: ProductionTerminalDisplaySettings = {
  show_product_image: true,
  show_name: true,
  show_sku: true,
  show_ean: true,
  show_catalog_number: true,
  show_source_location: true,
  show_target_location: false,
  show_stock_level: true,
  show_unit: true,
  show_barcode: true,
};

const DEFAULT_TRACEABILITY: ProductionTraceabilitySettings = {
  mode: "OFF",
  require_batch: false,
  require_serial: false,
  require_expiry: false,
};

export function useWmsProductionSettings() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DAMAGE_TENANT_ID;
  const warehouseId = warehouse?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<WmsProductionSettings | null>(null);

  const reload = useCallback(async () => {
    if (warehouseId == null) {
      setSettings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSettings(await getWmsProductionSettings({ tenantId, warehouseId }));
    } catch {
      setSettings({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        terminal_display: DEFAULT_DISPLAY,
        terminal_required: {
          require_batch_number: false,
          require_serial: false,
          require_lot: false,
          require_production_date: false,
          require_expiry_date: false,
          require_operator: false,
          require_quality_control: false,
        },
        traceability: DEFAULT_TRACEABILITY,
        forecast: {
          strategy: "PERIOD_AVERAGE",
          sales_lookback_days: 30,
        },
        reservation: {
          allocation_strategy: "FEFO",
          allow_sales_locations: false,
        },
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    loading,
    display: settings?.terminal_display ?? DEFAULT_DISPLAY,
    traceability: settings?.traceability ?? DEFAULT_TRACEABILITY,
    reload,
  };
}
