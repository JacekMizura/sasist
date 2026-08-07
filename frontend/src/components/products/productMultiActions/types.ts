import type { BulkUpdateAction } from "../../../api/productsBulkApi";
import type { ProductBulkListFiltersPayload } from "../../../utils/productListBulkFilters";
import type { MultiModuleDef, ModuleCardProps, MultiActionRow, MultiConfigBag } from "../../multiActions";

/** Selection shape shared with delete modal / list host. */
export type ProductBulkModalSelection =
  | { mode: "explicit_ids"; productIds: number[] }
  | { mode: "filtered_query"; filters: ProductBulkListFiltersPayload; count: number };

/** Stage 1 + reserved future module IDs (future not registered in picker). */
export type ProductMultiModuleId =
  | "manufacturer"
  | "categories"
  | "product_family"
  | "prices"
  | "vat_rate"
  | "unit_dimensions"
  | "master_carton"
  | "weight"
  | "logistics_data"
  | "orientation_stacking"
  | "wms_validation"
  | "wms_replenishment"
  | "tags"
  | "custom_fields"
  | "product_status"
  | "generate_ean"
  | "gpsr"
  | "photos"
  | "offers"
  | "production"
  | "relations"
  | "labels"
  | "suppliers"
  | "marketplace"
  | "automations"
  | "documents";

export type ProductBulkOp = {
  action: BulkUpdateAction | string;
  value: unknown;
};

export type ProductMultiActionRow = MultiActionRow<ProductMultiModuleId>;
export type ProductMultiSelection = ProductBulkModalSelection;
export type ProductMultiCardContext = { tenantId: number };
export type ProductMultiConfigBag = MultiConfigBag<ProductMultiModuleId>;

export type ProductModuleCardProps<TConfig = unknown> = ModuleCardProps<TConfig, ProductMultiCardContext>;

export type ProductMultiModuleDef<TConfig = unknown> = MultiModuleDef<
  ProductMultiModuleId,
  TConfig,
  ProductMultiCardContext,
  ProductBulkOp
>;

/** @deprecated Use ProductModuleCardProps */
export type ModuleCardProps<TConfig = unknown> = ProductModuleCardProps<TConfig>;
