import {
  CAPACITY_STRATEGY_OPTIONS,
  CapacityStrategy,
  type CapacityStrategyValue,
} from "../../types/cartCapacity";

type CapacityStrategyFieldsProps = {
  strategy: CapacityStrategyValue;
  onStrategyChange: (strategy: CapacityStrategyValue) => void;
  capacityOrders: number | "";
  onCapacityOrdersChange: (v: number | "") => void;
  /** BULK only — MULTI is always BASKETS */
  cartKind: "BULK" | "MULTI";
  namePrefix?: string;
};

export function CapacityStrategyFields({
  strategy,
  onStrategyChange,
  capacityOrders,
  onCapacityOrdersChange,
  cartKind,
  namePrefix = "capacityStrategy",
}: CapacityStrategyFieldsProps) {
  const options =
    cartKind === "MULTI"
      ? CAPACITY_STRATEGY_OPTIONS.filter((o) => o.value === CapacityStrategy.BASKETS)
      : CAPACITY_STRATEGY_OPTIONS.filter((o) => o.bulkOnly);

  const showOrders =
    strategy === CapacityStrategy.LIMIT_ORDERS ||
    strategy === CapacityStrategy.HYBRID_STOP_FIRST ||
    strategy === CapacityStrategy.HYBRID_STOP_VOLUME;

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="text-[11px] font-black uppercase tracking-wide text-slate-500">
          Strategia pojemności
        </legend>
        <div className="mt-2 space-y-2">
          {options.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name={namePrefix}
                value={opt.value}
                checked={strategy === opt.value}
                onChange={() => onStrategyChange(opt.value)}
                className="mt-1"
              />
              <span>
                <span className="font-semibold">{opt.label}</span>
                <span className="block text-[11px] text-slate-500">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {showOrders && cartKind === "BULK" ? (
        <label className="block text-sm">
          <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
            Limit zamówień
          </span>
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded border border-slate-200 px-3 py-2"
            value={capacityOrders}
            onChange={(e) => {
              const v = e.target.value;
              onCapacityOrdersChange(v === "" ? "" : Number(v));
            }}
            placeholder="np. 10"
          />
        </label>
      ) : null}
    </div>
  );
}
