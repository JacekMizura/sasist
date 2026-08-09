/**
 * Sellasist-aligned picking configurator option trees (UI labels + visibility).
 * Maps onto existing DB enums: pick_unit, single_mode/multi_mode, order_sort.
 */

export type PickingModeUi = "by_orders" | "by_products";
export type PickingContainersUi =
  | "cart_no_scan"
  | "cart_scan"
  | "baskets"
  | "mobile_cart"
  | "consolidation_rack";
export type PickingOrderSortUi = "date" | "location" | "courier";

export type PickingRadioOption<T extends string> = {
  value: T;
  label: string;
};

/** Top-level: „W jaki sposób chcesz zbierać zamówienia?” */
export const PICKING_COLLECTION_MODE_OPTIONS: PickingRadioOption<PickingModeUi>[] = [
  { value: "by_orders", label: "Po zamówieniach" },
  { value: "by_products", label: "Po produktach" },
];

/** Multi-item options when pick_unit = products */
export const BY_PRODUCTS_MULTI_CONTAINER_OPTIONS: PickingRadioOption<PickingContainersUi>[] = [
  { value: "baskets", label: "Do wózka z koszykami" },
  {
    value: "cart_scan",
    label: "Do wózka z wymuszaniem skanowania kodu kreskowego",
  },
  {
    value: "cart_no_scan",
    label: "Do wózka bez wymuszania skanowania kodu kreskowego",
  },
  {
    value: "consolidation_rack",
    label:
      "Do wózka z wymuszaniem skanowania kodu kreskowego oraz rozlokowaniem produktów na regał kompletacyjny",
  },
];

/** Single-item options when pick_unit = products */
export const BY_PRODUCTS_SINGLE_CONTAINER_OPTIONS: PickingRadioOption<PickingContainersUi>[] = [
  {
    value: "cart_scan",
    label: "Do wózka z wymuszaniem skanowania kodu kreskowego",
  },
  {
    value: "cart_no_scan",
    label: "Do wózka bez wymuszania skanowania kodu kreskowego",
  },
  {
    value: "mobile_cart",
    label: "Wózkiem mobilnym z procesem pakowania zamówienia",
  },
  { value: "baskets", label: "Do wózków z koszykami" },
];

export const ORDER_SORT_DATE_COURIER: PickingRadioOption<PickingOrderSortUi>[] = [
  { value: "date", label: "Po dacie, zaczynając od najstarszych zamówień" },
  {
    value: "courier",
    label: "Po grupach kurierskich z priorytetem zbierania zamówień do wysłania na dziś",
  },
];

export const ORDER_SORT_LOCATION_DATE_COURIER: PickingRadioOption<PickingOrderSortUi>[] = [
  { value: "location", label: "Po lokalizacjach" },
  { value: "date", label: "Po dacie, zaczynając od najstarszych zamówień" },
  {
    value: "courier",
    label: "Po grupach kurierskich z priorytetem zbierania zamówień do wysłania na dziś",
  },
];

/** Nested order selection under consolidation rack (multi / by products). */
export function showsConsolidationOrderSort(
  pickingMode: PickingModeUi,
  multiContainers: PickingContainersUi,
): boolean {
  return pickingMode === "by_products" && multiContainers === "consolidation_rack";
}

/** Nested order selection under single-item containers (by products), when multi is not consolidation. */
export function showsSingleItemOrderSort(
  pickingMode: PickingModeUi,
  singleContainers: PickingContainersUi,
  multiContainers: PickingContainersUi,
): boolean {
  if (pickingMode !== "by_products") return false;
  if (multiContainers === "consolidation_rack") return false;
  return (
    singleContainers === "cart_scan" ||
    singleContainers === "cart_no_scan" ||
    singleContainers === "baskets"
  );
}

export function showsByOrdersOrderSort(pickingMode: PickingModeUi): boolean {
  return pickingMode === "by_orders";
}

/** Coerce order_sort when nested UI only offers date|courier. */
export function coerceConsolidationOrderSort(sort: PickingOrderSortUi): PickingOrderSortUi {
  return sort === "courier" ? "courier" : "date";
}

export function ensureContainerInOptions(
  value: PickingContainersUi,
  options: PickingRadioOption<PickingContainersUi>[],
  fallback: PickingContainersUi,
): PickingContainersUi {
  return options.some((o) => o.value === value) ? value : fallback;
}

export function containerLabel(
  value: PickingContainersUi,
  options: PickingRadioOption<PickingContainersUi>[],
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
