/**
 * Single source of truth for cart statistics.
 * All UI components must use calculateCartStats(cart) instead of computing metrics separately.
 * Stats are computed on the backend and returned by GET /carts/ (list) and GET /carts/:id/ (detail).
 */

export type CartStats = {
  total_orders: number;
  total_products: number;
  baskets_used: number;
  used_volume_dm3: number;
  used_weight: number;
};

type CartLike = {
  total_orders?: number;
  total_products?: number;
  baskets_used?: number;
  used_volume?: number;
  used_volume_dm3?: number;
  total_weight_kg?: number;
  assigned_orders?: Array<{ order_id: number; total_volume_dm3?: number }>;
  baskets?: Array<{ order_id?: number | null }>;
};

/**
 * Returns unified cart statistics. Prefers backend-provided fields (total_orders, total_products, baskets_used).
 * Falls back to deriving from assigned_orders / baskets when opening detail before list refresh.
 */
export function calculateCartStats(cart: CartLike | null | undefined): CartStats {
  if (!cart) {
    return {
      total_orders: 0,
      total_products: 0,
      baskets_used: 0,
      used_volume_dm3: 0,
      used_weight: 0,
    };
  }

  const total_orders =
    typeof cart.total_orders === "number"
      ? cart.total_orders
      : (cart.assigned_orders?.length ?? 0);

  const total_products =
    typeof cart.total_products === "number" ? cart.total_products : 0;

  const baskets_used =
    typeof cart.baskets_used === "number"
      ? cart.baskets_used
      : (cart.baskets?.filter((b) => b.order_id != null).length ?? 0);

  const used_volume_dm3 =
    typeof cart.used_volume_dm3 === "number"
      ? cart.used_volume_dm3
      : typeof cart.used_volume === "number"
        ? cart.used_volume
        : Array.isArray(cart.assigned_orders) && cart.assigned_orders.length > 0
          ? cart.assigned_orders.reduce(
              (s, o) => s + Number(o.total_volume_dm3 ?? 0),
              0
            )
          : 0;

  const used_weight = Number(cart.total_weight_kg ?? 0);

  return {
    total_orders,
    total_products,
    baskets_used,
    used_volume_dm3,
    used_weight,
  };
}
