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
  /** Recommended put qty for this step (from distribution plan), not synthetic capacity. */
  putQty?: number | null;
};

function isTrusted(row: WmsPutawayLocationSuggestionRow): boolean {
  if (row.capacity_numeric_trusted === false) return false;
  if (String(row.capacity_confidence || row.confidence || "").toUpperCase() === "UNKNOWN") return false;
  if (String(row.geometry_source || "").toUpperCase() === "FALLBACK" && row.capacity_numeric_trusted !== true)
    return false;
  return true;
}

export default function PutawayLocationSuggestionCard({
  row,
  onSelect,
  disabled,
  variant = "default",
  recommended,
  putQty,
}: PutawayLocationSuggestionCardProps) {
  const isExisting = variant === "existing";
  const isRecommended = recommended ?? row.reason_tags?.includes("recommended");
  const trusted = isTrusted(row);
  const occupiedPct =
    trusted && row.utilization_percent != null
      ? row.utilization_percent
      : trusted && row.remaining_capacity_percent != null
        ? Math.max(0, 100 - row.remaining_capacity_percent)
        : null;

  const instructQty =
    putQty != null && putQty > 0
      ? putQty
      : trusted && row.additional_capacity != null && row.additional_capacity > 0
        ? row.additional_capacity
        : putQty === 0
          ? 0
          : null;

  const ratio =
    row.capacity_ratio_label ||
    (!trusted
      ? row.current_quantity <= 0
        ? "PUSTA · pojemność nieokreślona"
        : `${fmtQty(row.current_quantity)} szt. · pojemność nieokreślona`
      : row.total_capacity != null
        ? `${fmtQty(row.current_quantity)} / ${fmtQty(row.total_capacity)}`
        : `${fmtQty(row.current_quantity)} szt.`);

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
        {instructQty != null && instructQty > 0 ? (
          <span className="text-base font-black text-emerald-800">ODŁÓŻ: {fmtQty(instructQty)} szt.</span>
        ) : trusted && row.additional_capacity === 0 ? (
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            PEŁNA
          </span>
        ) : !trusted ? (
          <span className="text-sm font-black text-slate-700">POJEMNOŚĆ: NIEOKREŚLONA</span>
        ) : null}
        <span className="tabular-nums text-slate-700">
          {row.current_quantity <= 0 && !trusted ? (
            <span className="font-black text-slate-900">PUSTA</span>
          ) : (
            <>
              Stan: <span className="font-black text-slate-900">{ratio}</span>
            </>
          )}
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
      </div>
    </button>
  );
}
