import type { FilterMultiSelectOption } from "../components/filters/FilterMultiSelect";

export type ConditionOption = FilterMultiSelectOption<string>;

export const ORDER_SOURCE_OPTIONS: ConditionOption[] = [
  { value: "allegro", label: "Allegro" },
  { value: "shop", label: "Sklep internetowy" },
  { value: "amazon", label: "Amazon" },
  { value: "ebay", label: "eBay" },
  { value: "phone", label: "Telefon" },
  { value: "pos", label: "Sprzedaż stacjonarna" },
  { value: "manual", label: "Ręczne" },
];

export const SHIPMENT_COURIER_OPTIONS: ConditionOption[] = [
  { value: "inpost", label: "InPost" },
  { value: "dpd", label: "DPD" },
  { value: "dhl", label: "DHL" },
  { value: "ups", label: "UPS" },
  { value: "fedex", label: "FedEx" },
  { value: "gls", label: "GLS" },
  { value: "orlen", label: "ORLEN Paczka" },
  { value: "pickup", label: "Odbiór osobisty" },
];

export const SHIPMENT_STATUS_OPTIONS: ConditionOption[] = [
  { value: "pending", label: "Oczekuje" },
  { value: "label_created", label: "Etykieta utworzona" },
  { value: "in_transit", label: "W drodze" },
  { value: "delivered", label: "Dostarczono" },
  { value: "returned", label: "Zwrócono" },
  { value: "problem", label: "Problem" },
];

export const PAYMENT_METHOD_OPTIONS: ConditionOption[] = [
  { value: "transfer", label: "Przelew" },
  { value: "cod", label: "Pobranie" },
  { value: "card", label: "Karta płatnicza" },
  { value: "blik", label: "BLIK" },
  { value: "paypal", label: "PayPal" },
  { value: "installments", label: "Raty" },
  { value: "cash", label: "Gotówka" },
];

export const ORDER_TAG_OPTIONS: ConditionOption[] = [
  { value: "vip", label: "VIP" },
  { value: "express", label: "Express" },
  { value: "gift", label: "Prezent" },
  { value: "fragile", label: "Delikatne" },
  { value: "b2b", label: "B2B" },
];

export const ORDER_CATEGORY_OPTIONS: ConditionOption[] = [
  { value: "electronics", label: "Elektronika" },
  { value: "fashion", label: "Moda" },
  { value: "home", label: "Dom i ogród" },
  { value: "sport", label: "Sport" },
  { value: "kids", label: "Dziecko" },
  { value: "auto", label: "Motoryzacja" },
];

export function conditionOptionsForField(
  fieldKey: string,
  ctx: {
    statusOptions?: ConditionOption[];
    warehouseOptions?: ConditionOption[];
  },
): ConditionOption[] {
  switch (fieldKey) {
    case "order_status":
      return ctx.statusOptions ?? [];
    case "order_source":
      return ORDER_SOURCE_OPTIONS;
    case "shipment_courier":
      return SHIPMENT_COURIER_OPTIONS;
    case "shipment_status":
      return SHIPMENT_STATUS_OPTIONS;
    case "payment_method":
      return PAYMENT_METHOD_OPTIONS;
    case "warehouse_id":
      return ctx.warehouseOptions ?? [];
    case "order_tags":
      return ORDER_TAG_OPTIONS;
    case "order_categories":
      return ORDER_CATEGORY_OPTIONS;
    default:
      return [];
  }
}

export function resolveOptionLabels(values: string[], options: ConditionOption[]): string[] {
  const map = new Map(options.map((o) => [String(o.value), o.label]));
  return values.map((v) => map.get(v) ?? v);
}
