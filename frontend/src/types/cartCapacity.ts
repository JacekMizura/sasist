/** Capacity Engine snapshot — independent of Cart.status lifecycle. */

export const CapacityStrategy = {
  LIMIT_ORDERS: "LIMIT_ORDERS",
  LIMIT_VOLUME: "LIMIT_VOLUME",
  HYBRID_STOP_FIRST: "HYBRID_STOP_FIRST",
  HYBRID_STOP_VOLUME: "HYBRID_STOP_VOLUME",
  BASKETS: "BASKETS",
} as const;

export type CapacityStrategyValue = (typeof CapacityStrategy)[keyof typeof CapacityStrategy];

export const OccupancyState = {
  AVAILABLE: "AVAILABLE",
  WARNING: "WARNING",
  FULL: "FULL",
  OVERFLOW: "OVERFLOW",
} as const;

export type OccupancyStateValue = (typeof OccupancyState)[keyof typeof OccupancyState];

export type BasketSlotSnapshot = {
  id: number;
  occupied: boolean;
  order_id: number | null;
  usable_volume: number;
  used_volume: number;
  remaining_volume: number;
};

export type BasketSummary = {
  total: number;
  occupied: number;
  free: number;
  slots: BasketSlotSnapshot[];
};

export type CapacitySnapshot = {
  strategy: CapacityStrategyValue | string;
  occupancy_state: OccupancyStateValue | string;
  capacity_orders: number | null;
  capacity_volume: number | null;
  assigned_orders: number;
  assigned_volume: number;
  remaining_orders: number | null;
  remaining_volume: number | null;
  capacity_usage_percent: number;
  is_capacity_reached: boolean;
  basket_summary: BasketSummary | null;
};

export const CAPACITY_STRATEGY_OPTIONS: {
  value: CapacityStrategyValue;
  label: string;
  hint: string;
  bulkOnly?: boolean;
}[] = [
  {
    value: CapacityStrategy.LIMIT_ORDERS,
    label: "Limit zamówień",
    hint: "Pojemność wyłącznie liczbą zamówień",
    bulkOnly: true,
  },
  {
    value: CapacityStrategy.LIMIT_VOLUME,
    label: "Limit objętości",
    hint: "Pojemność wyłącznie objętością (np. wózek regałowy)",
    bulkOnly: true,
  },
  {
    value: CapacityStrategy.HYBRID_STOP_FIRST,
    label: "Hybryda — pierwszy limit",
    hint: "Stop przy pierwszym osiągniętym limicie (zamówienia lub objętość)",
    bulkOnly: true,
  },
  {
    value: CapacityStrategy.HYBRID_STOP_VOLUME,
    label: "Hybryda — do objętości",
    hint: "Limit zamówień orientacyjny; dobór trwa dopóki starcza objętości",
    bulkOnly: true,
  },
  {
    value: CapacityStrategy.BASKETS,
    label: "Koszyki",
    hint: "1 zamówienie na koszyk, best-fit objętościowy",
  },
];
