import { createModuleRegistry } from "../../multiActions";
import type { OrderMultiModuleDef, OrderMultiModuleId } from "./types";
import { customFieldModule } from "./modules/customFieldModule";
import { deleteModule } from "./modules/deleteModule";
import { documentModule } from "./modules/documentModule";
import { exportModule } from "./modules/exportModule";
import { fulfillmentWarehouseModule } from "./modules/fulfillmentWarehouseModule";
import { noteModule } from "./modules/noteModule";
import { operatorModule } from "./modules/operatorModule";
import { orderSourceModule } from "./modules/orderSourceModule";
import { orderStatusModule } from "./modules/orderStatusModule";
import { packingQueueModule } from "./modules/packingQueueModule";
import { paymentStatusModule } from "./modules/paymentStatusModule";
import { shippingMethodModule } from "./modules/shippingMethodModule";
import { tagsModule } from "./modules/tagsModule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ORDER_MULTI_MODULES: OrderMultiModuleDef<any>[] = [
  orderStatusModule,
  paymentStatusModule,
  operatorModule,
  tagsModule,
  noteModule,
  shippingMethodModule,
  fulfillmentWarehouseModule,
  orderSourceModule,
  customFieldModule,
  documentModule,
  packingQueueModule,
  exportModule,
  deleteModule,
];

const registry = createModuleRegistry(ORDER_MULTI_MODULES);

export const getOrderMultiModule = registry.getModule as (id: OrderMultiModuleId) =>
  | OrderMultiModuleDef
  | undefined;
export const listPickerModules = registry.listPickerModules;
export const listPickerGroups = registry.listPickerGroups;
