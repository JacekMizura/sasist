import type { Warehouse } from "../../context/WarehouseContext";
import { UI_STRINGS } from "../../constants/uiStrings";

export type DesignerWarehouseSelectProps = {
  warehouseId: number | null;
  warehouses: Warehouse[];
  loading?: boolean;
  onSelect: (warehouse: Warehouse) => void;
};

/**
 * Local warehouse picker for Projektant Magazynu (always visible in designer header).
 * Global ERP header selector may be hidden on narrow viewports or when only one WH exists.
 */
export function DesignerWarehouseSelect({
  warehouseId,
  warehouses,
  loading = false,
  onSelect,
}: DesignerWarehouseSelectProps) {
  const label = UI_STRINGS.warehouse.pdfExport.warehouseLabel;

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-slate-500" aria-busy="true">
        <span className="font-medium">{label}</span>
        <span>Ładowanie…</span>
      </div>
    );
  }

  if (warehouses.length === 0) {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-amber-800">
        <span className="font-medium">{label}</span>
        <span>{UI_STRINGS.warehouse.selector.selectWarehouse}</span>
      </div>
    );
  }

  if (warehouses.length === 1) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-sm">
        <span className="font-medium text-slate-500">{label}</span>
        <span className="font-semibold text-slate-800">{warehouses[0].name}</span>
      </div>
    );
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="shrink-0 font-medium text-slate-500">{label}</span>
      <select
        aria-label="Magazyn"
        value={warehouseId ?? ""}
        onChange={(e) => {
          const id = Number(e.target.value);
          const w = warehouses.find((x) => x.id === id);
          if (w) onSelect(w);
        }}
        className="h-8 min-w-[9rem] max-w-[14rem] rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-sm focus:border-cyan-400/70 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 sm:min-w-[10rem] sm:text-sm"
      >
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}
