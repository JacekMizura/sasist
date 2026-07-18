import {
  CapacityStrategy,
  OccupancyState,
  type CapacitySnapshot,
} from "../../../types/cartCapacity";

type CartCapacitySectionProps = {
  capacity: CapacitySnapshot | null | undefined;
};

function fmtVol(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Sekcja pojemności — niezależna od Cart.status (lifecycle). */
export default function CartCapacitySection({ capacity }: CartCapacitySectionProps) {
  if (!capacity) return null;

  const strategy = String(capacity.strategy || "").toUpperCase();
  const occ = String(capacity.occupancy_state || "").toUpperCase();
  const showFullLabel = occ === OccupancyState.FULL || occ === OccupancyState.OVERFLOW;

  const baskets = capacity.basket_summary;
  const isBaskets = strategy === CapacityStrategy.BASKETS && baskets;
  const isOrders =
    strategy === CapacityStrategy.LIMIT_ORDERS ||
    strategy === CapacityStrategy.HYBRID_STOP_FIRST ||
    strategy === CapacityStrategy.HYBRID_STOP_VOLUME;
  const isVolume =
    strategy === CapacityStrategy.LIMIT_VOLUME ||
    strategy === CapacityStrategy.HYBRID_STOP_FIRST ||
    strategy === CapacityStrategy.HYBRID_STOP_VOLUME;

  return (
    <div className="mt-1 space-y-0.5 text-[10px] font-semibold text-slate-600">
      <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Pojemność</div>

      {isBaskets && baskets ? (
        <>
          <div>
            {baskets.occupied} / {baskets.total} koszyków
          </div>
          <div className="flex flex-wrap gap-0.5 font-mono text-[11px] leading-none tracking-tight text-slate-700">
            {baskets.slots.map((s) => (
              <span key={s.id} title={s.occupied ? `Zamówienie ${s.order_id}` : "Wolny"}>
                {s.occupied ? "■" : "□"}
              </span>
            ))}
          </div>
          {baskets.free > 0 ? (
            <div className="text-slate-500">
              {baskets.free} wolny{baskets.free === 1 ? " koszyk" : "ch koszyków"}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {isOrders && capacity.capacity_orders != null ? (
            <div>
              {capacity.assigned_orders} / {capacity.capacity_orders} zamówień
            </div>
          ) : null}
          {isVolume && capacity.capacity_volume != null ? (
            <div>
              {fmtVol(capacity.assigned_volume)} / {fmtVol(capacity.capacity_volume)} l
            </div>
          ) : null}
        </>
      )}

      {showFullLabel ? (
        <div className="font-black text-amber-700">Brak wolnej pojemności</div>
      ) : occ === OccupancyState.WARNING ? (
        <div className="text-amber-600">Pojemność na wyczerpaniu</div>
      ) : null}
    </div>
  );
}
