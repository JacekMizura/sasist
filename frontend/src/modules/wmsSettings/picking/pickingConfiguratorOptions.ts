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
  /** Opcja widoczna, ale niedostępna dla bieżącej metody zbierania. */
  disabled?: boolean;
  disabledReason?: string;
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

/**
 * Sposób doboru zamówień w kolumnach po produktach — zawsze widoczny
 * (niezależnie od metody zbierania / kontenera).
 */
export function showsByProductsOrderSort(pickingMode: PickingModeUi): boolean {
  return pickingMode === "by_products";
}

/** @deprecated Prefer {@link showsByProductsOrderSort} — sekcja nie zależy od kontenera. */
export function showsConsolidationOrderSort(
  pickingMode: PickingModeUi,
  _multiContainers?: PickingContainersUi,
): boolean {
  return showsByProductsOrderSort(pickingMode);
}

/** @deprecated Prefer {@link showsByProductsOrderSort} — sekcja nie zależy od kontenera. */
export function showsSingleItemOrderSort(
  pickingMode: PickingModeUi,
  _singleContainers?: PickingContainersUi,
  _multiContainers?: PickingContainersUi,
): boolean {
  return showsByProductsOrderSort(pickingMode);
}

export function showsByOrdersOrderSort(pickingMode: PickingModeUi): boolean {
  return pickingMode === "by_orders";
}

/**
 * „Po lokalizacjach” nie jest dostępne przy regale kompletacyjnym
 * (wspólne ``order_sort`` w konfiguracji magazynu).
 */
export function isLocationOrderSortDisabledForMultiContainer(
  multiContainers: PickingContainersUi,
): boolean {
  return multiContainers === "consolidation_rack";
}

export const LOCATION_ORDER_SORT_DISABLED_REASON =
  "Niedostępne przy zbieraniu na regał kompletacyjny (zamówienia wieloelementowe).";

/** Opcje doboru dla jednoelementowych — z ewentualnym wyłączeniem lokalizacji. */
export function singleItemOrderSortOptions(
  multiContainers: PickingContainersUi,
): PickingRadioOption<PickingOrderSortUi>[] {
  const locationDisabled = isLocationOrderSortDisabledForMultiContainer(multiContainers);
  return ORDER_SORT_LOCATION_DATE_COURIER.map((opt) =>
    opt.value === "location" && locationDisabled
      ? { ...opt, disabled: true, disabledReason: LOCATION_ORDER_SORT_DISABLED_REASON }
      : opt,
  );
}

/** Coerce order_sort when nested UI only offers date|courier (zapis przy regale). */
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

/** Zwarte etykiety kolejności na liście konfiguratora (makieta). */
export function orderSortListLabel(sort: PickingOrderSortUi): string {
  if (sort === "location") return "Po lokalizacjach";
  if (sort === "courier") return "Po grupach kurierskich (priorytet na dziś)";
  return "Po dacie (najstarsze)";
}

/** Zwarte etykiety kontenera na liście (bez technicznych skrótów). */
export function containerListLabel(
  value: PickingContainersUi,
  orderType: "single_item" | "multi_item",
): string {
  if (value === "cart_no_scan") return "Bez skanowania kodu kreskowego";
  if (value === "cart_scan") return "Wózek (wymagany skan)";
  if (value === "mobile_cart") return "Wózek mobilny z pakowaniem";
  if (value === "consolidation_rack") {
    return "Skan + rozlokowanie na regał kompletacyjny";
  }
  if (value === "baskets") {
    return orderType === "single_item" ? "Do wózków z koszykami" : "Do wózka z koszykami";
  }
  return value;
}
