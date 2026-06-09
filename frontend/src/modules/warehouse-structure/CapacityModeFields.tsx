import {
  productLikeFieldLabelClass,
  productLikeInputClass,
} from "../../components/catalog/productLikeTokens";
import { CAPACITY_MODE_OPTIONS, type CapacityMode } from "./labels";

type CapacityModeFieldsProps = {
  mode: CapacityMode;
  onModeChange: (mode: CapacityMode) => void;
  maxVolumeDm3: number | "";
  onMaxVolumeChange: (v: number | "") => void;
  maxOrders: number | "";
  onMaxOrdersChange: (v: number | "") => void;
  volumePlaceholder?: string;
  namePrefix?: string;
};

export function CapacityModeFields({
  mode,
  onModeChange,
  maxVolumeDm3,
  onMaxVolumeChange,
  maxOrders,
  onMaxOrdersChange,
  volumePlaceholder,
  namePrefix = "capacityMode",
}: CapacityModeFieldsProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className={productLikeFieldLabelClass}>Tryb pojemności</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {CAPACITY_MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer flex-col rounded-lg border p-3 transition-colors ${
                mode === opt.value
                  ? "border-slate-800 bg-slate-50 ring-1 ring-slate-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={namePrefix}
                  checked={mode === opt.value}
                  onChange={() => onModeChange(opt.value)}
                  className="h-4 w-4 text-slate-800"
                />
                <span className="text-sm font-semibold text-slate-900">{opt.label}</span>
              </span>
              <span className="mt-1 pl-6 text-xs text-slate-500">{opt.hint}</span>
            </label>
          ))}
        </div>
      </div>

      {(mode === "volume" || mode === "mixed") && (
        <div className="max-w-xs">
          <label className={productLikeFieldLabelClass}>Maks. objętość (dm³)</label>
          <input
            type="number"
            min={0}
            step={0.1}
            className={productLikeInputClass}
            value={maxVolumeDm3 === "" ? "" : maxVolumeDm3}
            onChange={(e) => onMaxVolumeChange(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder={volumePlaceholder}
          />
        </div>
      )}

      {(mode === "orders" || mode === "mixed") && (
        <div className="max-w-xs">
          <label className={productLikeFieldLabelClass}>Maks. liczba zamówień</label>
          <input
            type="number"
            min={1}
            className={productLikeInputClass}
            value={maxOrders === "" ? "" : maxOrders}
            onChange={(e) => onMaxOrdersChange(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="np. 10"
          />
        </div>
      )}
    </div>
  );
}
