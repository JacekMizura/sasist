import type { WarehouseStateView } from "../wms/supply-flow/utils/shiftBoard";
import type { WarehouseOperationsSummary } from "../../api/warehouseOperationsApi";

type Props = {
  state: WarehouseStateView;
  ops: WarehouseOperationsSummary | null;
};

/** Jedna linia stanu — bez KPI kafli. */
export function PulpitWarehouseStatus({ state, ops }: Props) {
  const items = [
    { label: "Na rampie", value: state.onRamp },
    { label: "Do rozlokowania", value: state.awaitingPutaway || ops?.products_waiting_putaway || 0 },
    { label: "Kompletacja", value: ops?.picking ?? 0 },
    { label: "Operatorzy", value: ops?.active_operators ?? 0 },
    {
      label: "Problemy",
      value: (ops?.blocked_orders ?? 0) + (ops?.shortages ?? 0) + (state.unlockableOrders || 0),
      warn: true,
    },
  ];

  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-slate-700">
      {items.map((item, i) => (
        <span key={item.label} className="inline-flex items-baseline gap-1.5">
          {i > 0 ? <span className="text-slate-300 select-none" aria-hidden>·</span> : null}
          <span className="text-slate-500">{item.label}</span>
          <span
            className={`font-bold tabular-nums ${
              item.warn && item.value > 0 ? "text-amber-700" : "text-slate-900"
            }`}
          >
            {item.value}
          </span>
        </span>
      ))}
    </div>
  );
}
