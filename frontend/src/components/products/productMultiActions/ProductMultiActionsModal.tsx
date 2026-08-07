import { MultiActionsModal } from "../../multiActions";
import { getProductMultiModule, listPickerGroups } from "./registry";
import type { ProductMultiActionRow, ProductMultiConfigBag, ProductMultiModuleId } from "./types";

function productCountLabel(n: number): string {
  if (n === 1) return "1 produkt";
  if (n >= 2 && n <= 4) return `${n} produkty`;
  return `${n} produktów`;
}

export type ProductMultiActionsModalProps = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  productCount: number;
  busy?: boolean;
  onExecute: (payload: {
    rows: ProductMultiActionRow[];
    config: ProductMultiConfigBag;
  }) => Promise<void> | void;
};

export function ProductMultiActionsModal({
  open,
  onClose,
  tenantId,
  productCount,
  busy,
  onExecute,
}: ProductMultiActionsModalProps) {
  const cardContext = { tenantId };

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
    <MultiActionsModal<ProductMultiModuleId, typeof cardContext>
      open={open}
      onClose={onClose}
      entityCount={productCount}
      busy={busy}
      cardContext={cardContext}
      entityLabel={productCountLabel}
      confirmLabel={(n) => `Potwierdzam wykonanie na ${productCountLabel(n)}.`}
      getModule={getProductMultiModule}
      listPickerGroups={listPickerGroupsWithIcons}
      onExecute={onExecute}
    />
  );
}
