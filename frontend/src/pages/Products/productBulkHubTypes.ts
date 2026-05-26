import type { BulkUpdateAction } from "../../api/productsBulkApi";
import type { ProductBulkPatchPreset } from "./productBulkLogisticsFields";

export type ProductBulkHubChoice = BulkUpdateAction | ProductBulkPatchPreset | "delete_products";

export function isBulkUpdateAction(choice: ProductBulkHubChoice): choice is BulkUpdateAction {
  return (
    choice === "set_manufacturer" ||
    choice === "set_supplier" ||
    choice === "set_price" ||
    choice === "increase_price_percent" ||
    choice === "set_vat_rate" ||
    choice === "set_weight" ||
    choice === "set_dimensions" ||
    choice === "set_min_stock"
  );
}

export function isBulkPatchPreset(choice: ProductBulkHubChoice): choice is ProductBulkPatchPreset {
  return (
    choice === "patch_wms_requirements" ||
    choice === "patch_replenishment" ||
    choice === "patch_logistics_data" ||
    choice === "patch_orientation_stacking" ||
    choice === "clear_logistics_data" ||
    choice === "toggle_master_carton_pack"
  );
}
