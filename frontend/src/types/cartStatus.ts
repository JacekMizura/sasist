/** Canonical cart lifecycle status — mirrors backend ``CartStatus``. */
export const CartStatus = {
  AVAILABLE: "AVAILABLE",
  ASSIGNED: "ASSIGNED",
  PICKING: "PICKING",
  READY_FOR_PACKING: "READY_FOR_PACKING",
  PACKING: "PACKING",
} as const;

export type CartStatusValue = (typeof CartStatus)[keyof typeof CartStatus];

export const CART_STATUS_VALUES: readonly CartStatusValue[] = [
  CartStatus.AVAILABLE,
  CartStatus.ASSIGNED,
  CartStatus.PICKING,
  CartStatus.READY_FOR_PACKING,
  CartStatus.PACKING,
];

export function isCartStatus(value: string): value is CartStatusValue {
  return (CART_STATUS_VALUES as readonly string[]).includes(value);
}
