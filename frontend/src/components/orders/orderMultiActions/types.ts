import type { ShippingMethodDto } from "../../../api/shippingMethodsApi";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import type { MultiModuleDef, ModuleCardProps, MultiActionRow, MultiConfigBag } from "../../multiActions";
import type { BulkActionConfig, BulkActionKind } from "../../orders/orderList/bulkMultiActionTypes";
import type { OrderListBulkSelectionArg } from "../../orders/orderList/executeOrderBulkActions";

export type OrderMultiModuleId =
  | "order_status"
  | "payment_status"
  | "operator"
  | "tags"
  | "note"
  | "shipping_method"
  | "fulfillment_warehouse"
  | "order_source"
  | "custom_field"
  | "document"
  | "packing_queue"
  | "export"
  | "delete";

export type OrderMultiHostAction = "packing_queue" | "export" | "delete";

export type OrderMultiBulkOp = {
  kind: BulkActionKind;
  config: Partial<BulkActionConfig>;
};

export type OrderMultiHostOp = {
  host: OrderMultiHostAction;
};

export type OrderMultiCustomFieldOp = {
  customField: {
    fieldId: number;
    stringValue: string;
    numberValue: string;
    optionId: string;
    multiOptionIds: number[];
  };
};

export type OrderMultiOp = OrderMultiBulkOp | OrderMultiHostOp | OrderMultiCustomFieldOp;

export type OrderMultiActionRow = MultiActionRow<OrderMultiModuleId>;
export type OrderMultiConfigBag = MultiConfigBag<OrderMultiModuleId>;
export type OrderMultiSelection = OrderListBulkSelectionArg;

export type OrderMultiCardContext = {
  tenantId: number;
  warehouseId: number | null;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[] | null;
  shippingMethods: ShippingMethodDto[];
};

export type OrderModuleCardProps<TConfig = unknown> = ModuleCardProps<TConfig, OrderMultiCardContext>;

export type OrderMultiModuleDef<TConfig = unknown> = MultiModuleDef<
  OrderMultiModuleId,
  TConfig,
  OrderMultiCardContext,
  OrderMultiOp
>;
