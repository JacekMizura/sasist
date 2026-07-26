import type { Warehouse } from "../../context/WarehouseContext";
import { UI_STRINGS } from "../../constants/uiStrings";
import { Select, StatusBadge, StatusText, colors, radius, sizes } from "../../design-system";

export type DesignerWarehouseSelectProps = {
  warehouseId: number | null;
  warehouses: Warehouse[];
  loading?: boolean;
  onSelect: (warehouse: Warehouse) => void;
};

const chipClass = `inline-flex ${sizes.controlLg} items-center ${radius.md} border ${colors.border.soft} px-2.5 text-sm`;

/**
 * Local warehouse picker for Projektant Magazynu (always visible in designer header).
 * Dropdown only — no „Magazyn:” label (breadcrumb / title provide context).
 */
export function DesignerWarehouseSelect({
  warehouseId,
  warehouses,
  loading = false,
  onSelect,
}: DesignerWarehouseSelectProps) {
  if (loading) {
    return (
      <div className={`${chipClass} ${colors.surface.muted}`} aria-busy="true">
        <StatusText tone="neutral">Ładowanie…</StatusText>
      </div>
    );
  }

  if (warehouses.length === 0) {
    return (
      <div className={`${chipClass} ${colors.warning.softBg} border-amber-200`}>
        <StatusText tone="warning">{UI_STRINGS.warehouse.selector.selectWarehouse}</StatusText>
      </div>
    );
  }

  if (warehouses.length === 1) {
    return (
      <div className={`${chipClass} ${colors.surface.page}`}>
        <StatusBadge tone="neutral">{warehouses[0].name}</StatusBadge>
      </div>
    );
  }

  return (
    <Select
      aria-label="Magazyn"
      density="comfortable"
      focusTone="brand"
      className="min-w-[9rem] max-w-[14rem] sm:min-w-[10rem]"
      value={warehouseId ?? ""}
      onChange={(e) => {
        const id = Number(e.target.value);
        const w = warehouses.find((x) => x.id === id);
        if (w) onSelect(w);
      }}
    >
      {warehouses.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </Select>
  );
}
