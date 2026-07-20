import { Check, MapPin } from "lucide-react";
import type { WmsPutawayLocationSuggestionRow } from "../../../api/wmsPutawayApi";
import CapacityBadge from "../../warehouse/CapacityBadge";
import { fmtQty } from "../../../pages/wms/putawayFormat";

type PutawayLocationSuggestionCardProps = {
  row: WmsPutawayLocationSuggestionRow;
  onSelect: () => void;
  disabled?: boolean;
  variant?: "default" | "existing" | "overflow";
  recommended?: boolean;
};

function confidenceIsEstimated(c?: string | null): boolean {
  return String(c || "").toUpperCase() === "ESTIMATED";
}

export default function PutawayLocationSuggestionCard({
  row,
  onSelect,
  disabled,
  variant = "default",
  recommended,
}: PutawayLocationSuggestionCardProps) {
  const isExisting = variant === "existing";
  const isRecommended = recommended ?? row.reason_tags?.includes("recommended");
  const occupiedPct =
    row.utilization_percent != null
      ? row.utilization_percent
      : row.remaining_capacity_percent != null
        ? Math.max(0, 100 - row.remaining_capacity_percent)
        : null;
  const estimated = confidenceIsEstimated(row.confidence);
  const ratio =
    row.capacity_ratio_label ||
    (row.total_capacity != null
      ? estimated
        ? `${fmtQty(row.current_quantity)} / ~${fmtQty(row.total_capacity)}`
        : `${fmtQty(row.current_quantity)} / ${fmtQty(row.total_capacity)}`
      : `${fmtQty(row.current_quantity)} szt.`);
  const addLabel =
    row.additional_capacity_label ||
    (row.additional_capacity != null && row.additional_capacity > 0
      ? estimated
        ? `Szacunkowo można dołożyć do ${fmtQty(row.additional_capacity)} szt.`
        : `Można dołożyć ${fmtQty(row.additional_capacity)} szt.`
      : row.additional_capacity === 0
        ? "PEŁNA"
        : null);

  return (
    <button
      type="button"
      disabled={disabled || row.capacity_fits === false}
      onClick={onSelect}
      className={`flex w-full flex-col gap-2 rounded-2xl border p-4 text-left transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${
        isExisting
          ? "border-amber-200 bg-white hover:border-amber-400"
          : variant === "overflow"
            ? "border-orange-200 bg-white hover:border-orange-400"
            : "border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md"
      } ${row.capacity_fits === false ? "border-red-200 bg-red-50/40" : ""} ${
        isRecommended ? "ring-2 ring-indigo-300" : ""
      }`}
    >
      <div className="flex w-full items-start justify-between gap-2 bg-transparent">
        <div className="flex min-w-0 items-center gap-2 bg-transparent">
          <MapPin className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2.5} />
          <span className="truncate text-lg font-black text-slate-900">{row.code}</span>
        </div>
        {occupiedPct != null ? <CapacityBadge utilizationPercent={occupiedPct} /> : null}
      </div>

      <div className="flex w-full flex-col gap-1 text-xs font-bold text-slate-600 bg-transparent">
        {row.additional_capacity != null && row.additional_capacity > 0 ? (
          <span className={`text-base font-black ${estimated ? "text-amber-800" : "text-emerald-800"}`}>
            ODŁÓŻ: {estimated ? "~" : ""}
            {fmtQty(row.additional_capacity)} szt.
          </span>
        ) : row.additional_capacity === 0 ? (
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            PEŁNA
          </span>
        ) : null}
        <span className="tabular-nums text-slate-700">
          Stan: <span className="font-black text-slate-900">{ratio}</span> szt.
        </span>
        {row.same_sku_present ? (
          <span className="inline-flex items-center gap-1 text-indigo-700">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Ten sam produkt już tu leży
          </span>
        ) : null}
        {isRecommended ? (
          <span className="inline-flex items-center gap-1 text-[#5a4fcf]">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Rekomendowane
          </span>
        ) : null}
        {estimated || row.used_defaults ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-900">
            Pojemność szacunkowa
          </span>
        ) : null}
      </div>
    </button>
  );
}
