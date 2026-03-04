/**
 * Konfiguracja pól mapowania importu.
 * Każda sekcja (Produkty, Zamówienie, Koszyk, Adres, Płatność) ma listę kluczy pól systemowych.
 * Etykiety wyświetlane w UI są w pl.json pod kluczami import_f_<key>.
 */

export const PRODUCT_FIELDS = [
  "identifier", "title", "catalog_number", "ean", "ean_extra", "symbol", "price", "promo_price",
  "purchase_price_gross", "vat", "weight", "images", "manufacturer", "main_category", "stock",
  "location", "status", "volume", "length", "width", "height", "extra_info", "is_bundle", "unit", "shipping_time", "tags",
  "is_new", "is_bestseller", "is_recommended", "is_promo", "variant_group", "attribute_group",
  "attributes", "parameters", "meta", "data_field", "extra_field", "price_fields",
] as const;

export const ORDER_ORDER_FIELDS = [
  "order_id", "date_added", "email", "comment", "amount_due", "currency", "order_status",
  "status_changed_at", "source", "has_invoice", "sales_doc_number", "pickup_point", "parcel_locker",
  "external_id", "tracking_numbers", "order_extra_field", "customer_login",
] as const;

export const ORDER_CART_FIELDS = [
  "product_name", "price", "price_before_discount", "vat", "quantity", "unit", "ean",
  "catalog_number", "symbol", "main_category", "purchase_price", "location", "external_offer_id", "internal_sku",
] as const;

export const ADDRESS_FIELDS = [
  "company_name", "nip", "first_name", "last_name", "street", "building_number", "address_extra",
  "postal_code", "city", "country", "region", "phone",
] as const;

export const PAYMENT_FIELDS = [
  "payment_name", "payment_status", "payment_fee", "payment_vat",
  "delivery_name", "delivery_cost", "delivery_vat",
] as const;

export type ProductFieldKey = (typeof PRODUCT_FIELDS)[number];
export type OrderOrderFieldKey = (typeof ORDER_ORDER_FIELDS)[number];
export type OrderCartFieldKey = (typeof ORDER_CART_FIELDS)[number];
export type AddressFieldKey = (typeof ADDRESS_FIELDS)[number];
export type PaymentFieldKey = (typeof PAYMENT_FIELDS)[number];

/** Normalize header for matching: lowercase, no diacritics, alphanumeric. */
export function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, " ");
}

/**
 * Predefined header aliases for auto-matching CSV columns.
 * Key = system field key; value = list of possible CSV header substrings (normalized).
 */
export const PRODUCT_HEADER_ALIASES: Partial<Record<string, string[]>> = {
  ean: ["kod ean", "ean", "kodean"],
  title: ["nazwa produktu", "tytul", "title", "nazwa", "product name"],
  identifier: ["identyfikator", "id", "identifier"],
  weight: ["waga", "weight"],
  length: ["dlugosc", "length", "długość"],
  width: ["szerokosc", "width", "szerokość"],
  height: ["wysokosc", "height", "wysokość"],
  volume: ["objetosc", "volume", "objętość"],
  quantity: ["ilosc", "qty", "quantity", "ilość", "sztuki"],
};

export const ORDER_ORDER_HEADER_ALIASES: Partial<Record<string, string[]>> = {
  order_id: ["identyfikator (id)", "identyfikator (ID)", "identyfikator", "order id", "order number", "numer zamowienia", "id"],
  date_added: ["data", "date", "data dodania"],
};

export const ORDER_CART_HEADER_ALIASES: Partial<Record<string, string[]>> = {
  ean: ["kod ean", "ean", "kodean"],
  product_name: ["nazwa produktu", "tytul", "title", "nazwa", "product name"],
  quantity: ["ilosc", "qty", "quantity", "ilość", "sztuki"],
  weight: ["waga", "weight"],
};
