import { Check, MapPin } from "lucide-react";
import type { WmsPutawayLocationSuggestionRow } from "../../../api/wmsPutawayApi";
import CapacityBadge from "../../warehouse/CapacityBadge";
import { fmtQty } from "../../../pages/wms/putawayFormat";

type PutawayLocationSuggestionCardProps = {
  row: WmsPutawayLocationSuggestionRow;
  onSelect: () => void;
  disabled?: boolean;
  variant?: "default" | "existing";
};

export default function PutawayLocationSuggestionCard({
  row,
  onSelect,
  disabled,
  variant = "default",
}: PutawayLocationSuggestionCardProps) {
  const isExisting = variant === "existing";
  const recommended = row.reason_tags?.includes("recommended");
  const occupiedPct =
    row.remaining_capacity_percent != null ? Math.max(0, 100 - row.remaining_capacity_percent) : null;

  return (
    <button
      type="button"
      disabled={disabled || row.capacity_fits === false}
      onClick={onSelect}
      className={`flex w-full flex-col gap-2.5 rounded-2xl border p-4 text-left transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${
        isExisting
          ? "border-amber-250 bg-white hover:border-amber-400"
          : "border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md"
      } ${row.capacity_fits === false ? "border-red-200 bg-red-50/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 bg-transparent w-full">
        <div className="flex min-w-0 items-center gap-2 bg-transparent">
          <MapPin className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2.5} />
          <span className="truncate text-lg font-black text-slate-900">{row.code}</span>
        </div>
        {occupiedPct != null ? <CapacityBadge utilizationPercent={occupiedPct} /> : null}
      </div>
      <div className="flex flex-col gap-1.5 text-xs font-bold text-slate-600 bg-transparent w-full">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Na stanie: <span className="text-slate-800">{fmtQty(row.current_quantity)}</span> szt.
          </span>
          {row.warehouse_zone ? (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-600">
              {row.warehouse_zone}
            </span>
          ) : null}
          {row.free_capacity != null && row.free_capacity > 0 ? (
            <span>Wolne: {fmtQty(row.free_capacity)} dm³</span>
          ) : null}
        </div>
        {row.max_fit_quantity != null && row.max_fit_quantity > 0 ? (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Mieści {fmtQty(row.max_fit_quantity)} szt.
          </span>
        ) : null}
        {row.same_sku_present ? (
          <span className="inline-flex items-center gap-1 text-indigo-700">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Ten sam SKU już na lokacji
          </span>
        ) : null}
        {recommended ? (
          <span className="inline-flex items-center gap-1 text-[#5a4fcf]">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Rekomendowana
          </span>
        ) : null}
        {row.capacity_warnings?.map((w) => (
          <span key={w} className="text-red-700">
            {w}
          </span>
        ))}
      </div>
    </button>
  );
}
