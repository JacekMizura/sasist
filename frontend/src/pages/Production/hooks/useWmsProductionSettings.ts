import { useCallback, useEffect, useState } from "react";

import {
  getWmsProductionSettings,
  type ProductionTerminalDisplaySettings,
  type ProductionTerminalRequiredSettings,
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

const DEFAULT_REQUIRED: ProductionTerminalRequiredSettings = {
  require_batch_number: false,
  require_serial: false,
  require_lot: false,
  require_production_date: false,
  require_expiry_date: false,
  require_operator: false,
  require_quality_control: false,
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
        terminal_required: DEFAULT_REQUIRED,
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
    required: settings?.terminal_required ?? DEFAULT_REQUIRED,
    reload,
  };
}
