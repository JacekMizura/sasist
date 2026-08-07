import { MultiActionsModal } from "../../multiActions";
import type { ShippingMethodDto } from "../../../api/shippingMethodsApi";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import { getOrderMultiModule, listPickerGroups } from "./registry";
import type {
  OrderMultiActionRow,
  OrderMultiCardContext,
  OrderMultiConfigBag,
  OrderMultiModuleId,
} from "./types";

function orderCountLabel(n: number): string {
  if (n === 1) return "1 zamówienie";
  if (n >= 2 && n <= 4) return `${n} zamówienia`;
  return `${n} zamówień`;
}

export type OrderMultiActionsModalProps = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  warehouseId: number | null;
  orderCount: number;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups?: OrderUiPanelSubgroupRead[] | null;
  shippingMethods: ShippingMethodDto[];
  busy?: boolean;
  onExecute: (payload: {
    rows: OrderMultiActionRow[];
    config: OrderMultiConfigBag;
  }) => Promise<void> | void;
};

export function OrderMultiActionsModal({
  open,
  onClose,
  tenantId,
  warehouseId,
  orderCount,
  panelSummary,
  panelSubgroups = null,
  shippingMethods,
  busy,
  onExecute,
}: OrderMultiActionsModalProps) {
  const cardContext: OrderMultiCardContext = {
    tenantId,
    warehouseId,
    panelSummary,
    panelSubgroups,
    shippingMethods,
  };

  const listPickerGroupsWithIcons = () =>
    listPickerGroups().map((g) => ({
      group: g.group,
      modules: g.modules.map((m) => ({
        id: m.id,
        label: m.label,
        group: m.group,
        icon: m.icon,
      })),
    }));

  return (
    <MultiActionsModal<OrderMultiModuleId, OrderMultiCardContext>
      open={open}
      onClose={onClose}
      entityCount={orderCount}
      busy={busy}
      cardContext={cardContext}
      entityLabel={orderCountLabel}
      confirmLabel={(n) => `Potwierdzam wykonanie wybranych akcji na ${orderCountLabel(n)}.`}
      getModule={getOrderMultiModule}
      listPickerGroups={listPickerGroupsWithIcons}
      onExecute={onExecute}
    />
  );
}
