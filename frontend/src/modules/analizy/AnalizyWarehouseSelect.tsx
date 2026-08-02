/**
 * Selektor magazynu powiązany z WarehouseContext (SSOT aktywnego magazynu).
 * Nie utrzymuje lokalnej listy /warehouses/ — tylko kontekst aplikacji.
 */

import { useWarehouseApiScope } from "./warehouseApiScope";

type Props = {
  className?: string;
  selectClassName?: string;
  label?: string;
  /** Pokaż select nawet przy jednym magazynie (domyślnie: tylko gdy multi-WH). */
  forceSelect?: boolean;
};

export function AnalizyWarehouseSelect({
  className,
  selectClassName = "rounded border border-slate-300 px-3 py-1.5 text-sm bg-white",
  label = "Magazyn",
  forceSelect = false,
}: Props) {
  const {
    warehouseId,
    warehouse,
    warehouses,
    setWarehouse,
    showWarehouseSelector,
    loading,
  } = useWarehouseApiScope();

  if (loading) {
    return <span className="text-sm text-slate-500">Ładowanie magazynów…</span>;
  }

  const showSelect = forceSelect || showWarehouseSelector || warehouses.length > 1;

  if (!showSelect) {
    return (
      <span className={`text-sm text-slate-600 ${className ?? ""}`}>
        {label ? `${label}: ` : null}
        <span className="font-semibold text-slate-800">
          {warehouse?.name ?? "—"}
        </span>
      </span>
    );
  }

  const select = (
    <select
      value={warehouseId ?? ""}
      onChange={(e) => {
        const id = Number(e.target.value);
        const w = warehouses.find((x) => x.id === id);
        if (w) void setWarehouse(w);
      }}
      className={selectClassName}
    >
      <option value="">—</option>
      {warehouses.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name ?? `Magazyn ${w.id}`}
        </option>
      ))}
    </select>
  );

  if (!label) {
    return <div className={className}>{select}</div>;
  }

  return (
    <label className={`flex items-center gap-2 ${className ?? ""}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {select}
    </label>
  );
}
