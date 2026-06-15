import { useState } from "react";

import { useWarehouse } from "../../context/WarehouseContext";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";

type Props = {
  /** Use on dark headers (e.g. legacy WMS). `topbar` = compact light row (Sellasist-style WMS header). */
  variant?: "light" | "dark" | "topbar";
  className?: string;
  /** Show API errors visibly (WMS top bar); ERP strip keeps sr-only for layout density. */
  showErrorInline?: boolean;
};

/**
 * Global warehouse switcher — visible when user has access to more than one warehouse.
 * Persists active warehouse on the server (`user_wms_profiles.active_warehouse_id`).
 */
export default function GlobalWarehouseSelect({
  variant = "light",
  className,
  showErrorInline = false,
}: Props) {
  const { warehouse, setWarehouse, warehouses, showWarehouseSelector } = useWarehouse();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!showWarehouseSelector) {
    return null;
  }

  const selectCls =
    variant === "dark"
      ? "min-w-[10rem] max-w-[16rem] rounded-lg border border-slate-500 bg-slate-800 px-3 py-1.5 text-sm text-white shadow-sm focus:border-amber-400/80 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
      : variant === "topbar"
        ? "h-9 min-w-[8.5rem] max-w-[14rem] rounded-lg border border-slate-200/90 bg-slate-50/60 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm focus:border-cyan-400/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        : "min-w-[10rem] max-w-[16rem] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30";

  const labelCls =
    variant === "topbar"
      ? "hidden text-[11px] font-semibold text-slate-500 sm:inline"
      : "text-sm font-medium text-slate-600";

  const errorCls = showErrorInline
    ? "max-w-[14rem] text-[11px] font-medium text-red-600"
    : "sr-only";

  return (
    <div className="flex items-center gap-2">
      <span className={labelCls}>Magazyn:</span>
      <select
        aria-label="Magazyn"
        value={warehouse?.id ?? ""}
        disabled={busy}
        onChange={(e) => {
          const id = Number(e.target.value);
          const w = warehouses.find((x) => x.id === id);
          if (!w) return;
          setBusy(true);
          setError(null);
          void setWarehouse(w)
            .catch((err) => setError(extractApiErrorMessage(err)))
            .finally(() => setBusy(false));
        }}
        className={[selectCls, className].filter(Boolean).join(" ")}
      >
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {error ? <span className={errorCls}>{error}</span> : null}
    </div>
  );
}
