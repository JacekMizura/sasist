import { MapPin } from "lucide-react";
import type { WmsPutawayLocationSuggestionRow } from "../../../api/wmsPutawayApi";
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
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full flex-col gap-2.5 rounded-2xl border p-4 text-left transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${
        isExisting
          ? "border-amber-250 bg-white hover:border-amber-400"
          : "border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-2 bg-transparent w-full">
        <div className="flex min-w-0 items-center gap-2 bg-transparent">
          <MapPin className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2.5} />
          <span className="truncate text-lg font-black text-slate-900">{row.code}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500 bg-transparent w-full">
        <span>
          Na stanie: <span className="text-slate-800">{fmtQty(row.current_quantity)}</span> szt.
        </span>
        {row.warehouse_zone ? (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-600">
            {row.warehouse_zone}
          </span>
        ) : null}
        {row.free_capacity != null && row.free_capacity > 0 ? (
          <span>Wolne: {fmtQty(row.free_capacity)}</span>
        ) : null}
      </div>
    </button>
  );
}