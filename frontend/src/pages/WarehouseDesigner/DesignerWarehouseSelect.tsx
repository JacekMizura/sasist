import type { Warehouse } from "../../context/WarehouseContext";
import { UI_STRINGS } from "../../constants/uiStrings";

export type DesignerWarehouseSelectProps = {
  warehouseId: number | null;
  warehouses: Warehouse[];
  loading?: boolean;
  onSelect: (warehouse: Warehouse) => void;
};

/** Same height as PrimaryButton (Zapisz układ) — h-10. */
const selectClassName =
  "h-10 min-w-[9rem] max-w-[14rem] rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-sm focus:border-orange-400/70 focus:outline-none focus:ring-2 focus:ring-orange-500/20 sm:min-w-[10rem] sm:text-sm";

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
      <div className="inline-flex h-10 items-center rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 text-sm text-slate-500" aria-busy="true">
        Ładowanie…
      </div>
    );
  }

  if (warehouses.length === 0) {
    return (
      <div className="inline-flex h-10 items-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-sm text-amber-800">
        {UI_STRINGS.warehouse.selector.selectWarehouse}
      </div>
    );
  }

  if (warehouses.length === 1) {
    return (
      <div className="inline-flex h-10 items-center rounded-lg border border-slate-200/80 bg-white px-2.5 text-sm font-semibold text-slate-800 shadow-sm">
        {warehouses[0].name}
      </div>
    );
  }

  return (
    <select
      aria-label="Magazyn"
      value={warehouseId ?? ""}
      onChange={(e) => {
        const id = Number(e.target.value);
        const w = warehouses.find((x) => x.id === id);
        if (w) onSelect(w);
      }}
      className={selectClassName}
    >
      {warehouses.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}
