import { useState } from "react";
import { ChevronDown, Warehouse } from "lucide-react";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { useWarehouse } from "../../../context/WarehouseContext";

type Props = {
  className?: string;
};

/** Top-bar warehouse dropdown — same persistence logic as GlobalWarehouseSelect. */
export default function WarehouseSwitcher({ className = "" }: Props) {
  const { warehouse, setWarehouse, warehouses, showWarehouseSelector } = useWarehouse();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!showWarehouseSelector) return null;

  return (
    <div className={`relative shrink-0 ${className}`.trim()}>
      <Warehouse className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" aria-hidden />
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
        className="h-[42px] min-w-[10.5rem] max-w-[16rem] appearance-none rounded-xl border border-[#E5E7EB] bg-white py-0 pl-10 pr-9 text-sm font-medium text-[#0F172A] transition-colors duration-150 ease-out hover:border-[#CBD5E1] hover:bg-[#F8FAFC] focus:border-[#F97316] focus:outline-none focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)] disabled:opacity-60"
      >
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]"
        aria-hidden
      />
      {error ? <span className="sr-only">{error}</span> : null}
    </div>
  );
}
