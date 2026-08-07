import type { ProductMultiModuleDef, ProductMultiModuleId } from "./types";
import { categoriesModule } from "./modules/categoriesModule";
import { customFieldsModule } from "./modules/customFieldsModule";
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

/**
 * Stage 1 registry. Adding a future module = new file under modules/ + push here.
 * Reserved IDs (not registered): gpsr, photos, offers, production, relations,
 * labels, suppliers, marketplace, automations, documents.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PRODUCT_MULTI_MODULES: ProductMultiModuleDef<any>[] = [
  manufacturerModule,
  productStatusModule,
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

const byId = new Map(PRODUCT_MULTI_MODULES.map((m) => [m.id, m]));

export function getProductMultiModule(id: ProductMultiModuleId) {
  return byId.get(id);
}

export function listPickerModules() {
  return PRODUCT_MULTI_MODULES.filter((m) => m.stage === 1);
}

/** Grouped options for "+ Dodaj zmianę" select. */
export function listPickerGroups(): { group: string; modules: typeof PRODUCT_MULTI_MODULES }[] {
  const order: string[] = [];
  const map = new Map<string, typeof PRODUCT_MULTI_MODULES>();
  for (const m of listPickerModules()) {
    if (!map.has(m.group)) {
      order.push(m.group);
      map.set(m.group, []);
    }
    map.get(m.group)!.push(m);
  }
  return order.map((group) => ({ group, modules: map.get(group)! }));
}
