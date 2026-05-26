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
  "order_id",
  "date_added",
  "email",
  "comment",
  "amount_due",
  "paid_amount",
  "currency",
  "order_status",
  "status_changed_at",
  "source",
  "has_invoice",
  "sales_doc_number",
  "pickup_point",
  "parcel_locker",
  "external_id",
  "tracking_numbers",
  "order_extra_field",
  "customer_login",
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
  "delivery_name",
  "delivery_cost",
  "shipping_cost",
  "courier_price",
  "delivery_price",
  "delivery_vat",
] as const;

/** Import wierszy zestawów (bundle): nagłówek zestawu + identyfikatory składnika + ilość. */
export const SET_IMPORT_FIELDS = [
  "set_sku",
  "set_name",
  "child_sku",
  "child_id",
  "child_ean",
  "child_symbol",
  "child_catalog_number",
  "child_images",
  "qty",
] as const;

/** Import klientów (CRM) — zgodnie z polami API / eksportem „Klienci”. */
export const CUSTOMER_IMPORT_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "email",
  "phone",
  "company_name",
  "nip",
  "street",
  "building_number",
  "postal_code",
  "city",
  "country",
  "status",
  "created_at",
] as const;

export const CUSTOMER_IMPORT_HEADER_ALIASES: Partial<Record<string, string[]>> = {
  id: ["id klienta", "customer id", "id"],
  first_name: ["imie", "imię", "first name", "imie klienta"],
  last_name: ["nazwisko", "last name", "nazwisko klienta"],
  email: ["email", "e-mail", "mail"],
  phone: ["telefon", "phone", "tel", "mobile"],
  company_name: ["firma", "company", "nazwa firmy"],
  nip: ["nip", "tax id", "vat id"],
  street: ["ulica", "street", "adres"],
  building_number: ["numer domu", "nr domu", "building", "house"],
  postal_code: ["kod pocztowy", "postal", "zip"],
  city: ["miasto", "city", "miejscowosc", "miejscowość"],
  country: ["kraj", "country", "country code"],
  status: ["status", "aktywny", "archiwum", "stan"],
  created_at: ["data utworzenia", "created", "created at", "data dodania"],
};

export const SET_IMPORT_HEADER_ALIASES: Partial<Record<string, string[]>> = {
  set_sku: ["set sku", "sku zestawu", "kod zestawu", "bundle sku"],
  set_name: ["set name", "nazwa zestawu", "bundle name"],
  child_sku: ["child sku", "sku produktu", "ean", "symbol", "kod produktu"],
  child_id: ["id skladnika", "id składnika", "product id", "id produktu"],
  child_ean: ["ean skladnika", "ean składnika", "kod ean skladnika"],
  child_symbol: ["symbol skladnika", "symbol składnika", "sku skladnika"],
  child_catalog_number: ["numer katalogowy skladnika", "katalog skladnika", "catalog child"],
  child_images: ["zdjecia skladnika", "zdjęcia składnika", "zdjecia zestawu", "zdjęcia"],
  qty: ["qty", "ilosc", "ilość", "quantity", "sztuki"],
};

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
  email: ["email", "e-mail", "mail"],
  comment: ["comment", "note", "uwagi", "message", "komentarz"],
  tracking_numbers: ["tracking", "tracking_number", "list przewozowy", "numer listu"],
  paid_amount: ["paid", "paid_amount", "amount_paid", "oplacono", "opłacono"],
};

export const ADDRESS_HEADER_ALIASES: Partial<Record<string, string[]>> = {
  street: ["adres", "shipping address", "address_delivery", "adres dostawy", "ulica"],
  city: ["miasto", "city delivery"],
  postal_code: ["kod pocztowy", "postal"],
  country: ["kraj", "country"],
  phone: ["telefon", "phone", "tel"],
  first_name: ["imie", "imię", "first name"],
  last_name: ["nazwisko", "last name"],
  company_name: ["firma", "company"],
};

export const PAYMENT_HEADER_ALIASES: Partial<Record<string, string[]>> = {
  delivery_name: ["kurier", "carrier", "shipping", "metoda dostawy", "dostawa", "nazwa dostawy"],
  delivery_cost: ["koszt dostawy", "shipping cost", "delivery cost", "cena dostawy", "dostawa koszt"],
  shipping_cost: ["shipping cost", "koszt dostawy", "delivery cost", "courier price", "delivery price"],
  courier_price: ["courier price", "kurier cena", "koszt dostawy"],
  delivery_price: ["delivery price", "cena dostawy", "koszt dostawy"],
  payment_name: ["payment", "payment_method", "metoda platnosci", "metoda płatności", "platnosc", "płatność"],
  payment_status: ["paid_status", "payment_status", "status platnosci", "status płatności"],
};

export const ORDER_CART_HEADER_ALIASES: Partial<Record<string, string[]>> = {
  ean: ["kod ean", "ean", "kodean"],
  product_name: ["nazwa produktu", "tytul", "title", "nazwa", "product name"],
  quantity: ["ilosc", "qty", "quantity", "ilość", "sztuki"],
  weight: ["waga", "weight"],
};
