import type { ReactNode } from "react";

import type { BulkUpdateAction } from "../../../api/productsBulkApi";
import type { ProductBulkListFiltersPayload } from "../../../utils/productListBulkFilters";

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

export type ProductMultiActionRow = {
  id: string;
  moduleId: ProductMultiModuleId;
  expanded: boolean;
};

export type ProductMultiSelection = ProductBulkModalSelection;

export type ModuleCardProps<TConfig = unknown> = {
  config: TConfig;
  onChange: (next: TConfig) => void;
  tenantId: number;
  disabled?: boolean;
};

export type ProductMultiModuleDef<TConfig = unknown> = {
  id: ProductMultiModuleId;
  label: string;
  group: string;
  stage: 1 | "future";
  defaultConfig: () => TConfig;
  validate: (cfg: TConfig) => string | null;
  Card: (props: ModuleCardProps<TConfig>) => ReactNode;
  toOps: (cfg: TConfig) => ProductBulkOp[];
};

export type ProductMultiConfigBag = Partial<Record<ProductMultiModuleId, unknown>>;
