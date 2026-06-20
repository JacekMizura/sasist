import type { ProductBulkHubChoice } from "../../../pages/Products/productBulkHubTypes";

export type ProductBulkPrimaryAction = { id: ProductBulkHubChoice; label: string };

export const PRODUCT_BULK_PRIMARY_ACTIONS: ProductBulkPrimaryAction[] = [
  { id: "set_manufacturer", label: "Zmiana producenta" },
  { id: "set_supplier", label: "Zmiana domyślnego dostawcy" },
  { id: "set_price", label: "Aktualizacja cen" },
  { id: "set_vat_rate", label: "Zmiana stawki VAT" },
  { id: "set_min_stock", label: "Aktualizacja progów stanu" },
  { id: "patch_wms_requirements", label: "Ustaw wymagania WMS" },
  { id: "patch_logistics_data", label: "Ustaw dane logistyczne" },
  { id: "patch_replenishment", label: "Ustaw uzupełnienia" },
  { id: "patch_orientation_stacking", label: "Ustaw orientację / składowanie" },
  { id: "set_weight", label: "Ustaw wagę jednostki" },
  { id: "set_dimensions", label: "Ustaw wymiary jednostki" },
  { id: "toggle_master_carton_pack", label: "Opakowanie zbiorcze (WMS)" },
  { id: "delete_products", label: "Usuń produkty" },
];

export type ProductBulkMutationAction = { id: ProductBulkHubChoice; label: string };

export const PRODUCT_BULK_MUTATION_ACTIONS: ProductBulkMutationAction[] = [
  { id: "increase_price_percent", label: "Podniesienie ceny %" },
  { id: "clear_logistics_data", label: "Wyczyść dane logistyczne" },
];
