import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Barcode,
  BadgePercent,
  Boxes,
  CircleDollarSign,
  Factory,
  FolderTree,
  FormInput,
  Layers,
  Package,
  Ruler,
  Scale,
  ShieldCheck,
  Tags,
  ToggleLeft,
  Users,
  Warehouse,
  Weight,
} from "lucide-react";

import { MultiModulePicker } from "../../multiActions";
import { listPickerGroups } from "./registry";
import type { ProductMultiModuleId } from "./types";

const MODULE_ICONS: Partial<Record<ProductMultiModuleId, LucideIcon>> = {
  manufacturer: Factory,
  product_status: ToggleLeft,
  generate_ean: Barcode,
  categories: FolderTree,
  product_family: Users,
  tags: Tags,
  custom_fields: FormInput,
  prices: CircleDollarSign,
  vat_rate: BadgePercent,
  unit_dimensions: Ruler,
  weight: Weight,
  master_carton: Package,
  logistics_data: Boxes,
  orientation_stacking: Layers,
  wms_validation: ShieldCheck,
  wms_replenishment: Warehouse,
};

export type ProductMultiModulePickerProps = {
  open: boolean;
  disabledIds?: Set<ProductMultiModuleId>;
  onClose: () => void;
  onPick: (id: ProductMultiModuleId) => void;
};

export function ProductMultiModulePicker({ open, disabledIds, onClose, onPick }: ProductMultiModulePickerProps) {
  const groupsWithIcons = useMemo(
    () => () =>
      listPickerGroups().map((g) => ({
        ...g,
        modules: g.modules.map((m) => ({
          id: m.id,
          label: m.label,
          group: m.group,
          icon: MODULE_ICONS[m.id] ?? m.icon,
        })),
      })),
    [],
  );

  return (
    <MultiModulePicker
      open={open}
      disabledIds={disabledIds}
      onClose={onClose}
      onPick={onPick}
      listPickerGroups={groupsWithIcons}
      defaultIcon={Scale}
    />
  );
}
