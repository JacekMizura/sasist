import { useWarehouse } from "../../context/WarehouseContext";

type Props = {
  /** Use on dark headers (e.g. legacy WMS). `topbar` = compact light row (Sellasist-style WMS header). */
  variant?: "light" | "dark" | "topbar";
  className?: string;
};

/**
 * Shown in the app header when {@link useWarehouse.showWarehouseSelector} is true.
 * Single-warehouse tenants get no control — context auto-selects that warehouse.
 */
export default function GlobalWarehouseSelect({ variant = "light", className }: Props) {
  const { warehouse, setWarehouse, warehouses, showWarehouseSelector } = useWarehouse();

  if (!showWarehouseSelector) {
    return null;
  }

  const selectCls =
    variant === "dark"
      ? "min-w-[10rem] max-w-[16rem] rounded-lg border border-slate-500 bg-slate-800 px-3 py-1.5 text-sm text-white shadow-sm focus:border-amber-400/80 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
      : variant === "topbar"
        ? "h-9 min-w-[8.5rem] max-w-[14rem] rounded-lg border border-slate-200/90 bg-slate-50/60 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm focus:border-cyan-400/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        : "min-w-[10rem] max-w-[16rem] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30";

  return (
    <select
      aria-label="Magazyn"
      value={warehouse?.id ?? ""}
      onChange={(e) => {
        const id = Number(e.target.value);
        const w = warehouses.find((x) => x.id === id);
        if (w) setWarehouse(w);
      }}
      className={[selectCls, className].filter(Boolean).join(" ")}
    >
      {warehouses.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}
