import type { ProductMultiModuleDef, ProductMultiModuleId } from "./types";
import { categoriesModule } from "./modules/categoriesModule";
import { customFieldsModule } from "./modules/customFieldsModule";
import { generateEanModule } from "./modules/generateEanModule";
import { logisticsDataModule } from "./modules/logisticsDataModule";
import { manufacturerModule } from "./modules/manufacturerModule";
import { masterCartonModule } from "./modules/masterCartonModule";
import { orientationStackingModule } from "./modules/orientationStackingModule";
import { pricesModule } from "./modules/pricesModule";
import { productFamilyModule } from "./modules/productFamilyModule";
import { productStatusModule } from "./modules/productStatusModule";
import { tagsModule } from "./modules/tagsModule";
import { unitDimensionsModule } from "./modules/unitDimensionsModule";
import { vatRateModule } from "./modules/vatRateModule";
import { weightModule } from "./modules/weightModule";
import { wmsReplenishmentModule } from "./modules/wmsReplenishmentModule";
import { wmsValidationModule } from "./modules/wmsValidationModule";
import { createModuleRegistry } from "../../multiActions";

/**
 * Stage 1 registry. Adding a future module = new file under modules/ + push here.
 * Reserved IDs (not registered): gpsr, photos, offers, production, relations,
 * labels, suppliers, marketplace, automations, documents.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PRODUCT_MULTI_MODULES: ProductMultiModuleDef<any>[] = [
  manufacturerModule,
  productStatusModule,
  generateEanModule,
  categoriesModule,
  productFamilyModule,
  tagsModule,
  customFieldsModule,
  pricesModule,
  vatRateModule,
  unitDimensionsModule,
  weightModule,
  masterCartonModule,
  logisticsDataModule,
  orientationStackingModule,
  wmsValidationModule,
  wmsReplenishmentModule,
];

const registry = createModuleRegistry(PRODUCT_MULTI_MODULES);

export const getProductMultiModule = registry.getModule as (id: ProductMultiModuleId) =>
  | ProductMultiModuleDef
  | undefined;
export const listPickerModules = registry.listPickerModules;
export const listPickerGroups = registry.listPickerGroups;
