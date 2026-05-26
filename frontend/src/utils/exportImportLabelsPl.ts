import type { ExportEntityType } from "../api/exportsApi";

/** Etykiety typów encji (API → PL) — tylko UI. */
export const ENTITY_TYPE_LABEL_PL: Record<ExportEntityType, string> = {
  products: "Produkty",
  sets: "Zestawy",
  orders: "Zamówienia",
  cartons: "Kartony",
  suppliers: "Dostawcy",
  manufacturers: "Producenci",
  customers: "Klienci",
  label_templates: "System etykiet",
};

export function entityTypeLabelPl(type: string): string {
  return ENTITY_TYPE_LABEL_PL[type as ExportEntityType] ?? type;
}

/** Polskie nazwy pól CSV w szablonach eksportu (klucz API → etykieta). */
export const CSV_FIELD_LABEL_PL: Record<ExportEntityType, Record<string, string>> = {
  products: {
    id: "ID",
    name: "Nazwa",
    sku: "SKU",
    ean: "Kod kreskowy (EAN)",
    price: "Cena",
    stock: "Stan",
    location: "Lokalizacja",
    category: "Kategoria",
    brand: "Marka",
    supplier: "Dostawca",
    created_at: "Data utworzenia",
  },
  orders: {
    id: "ID zamówienia",
    external_id: "ID zewnętrzne",
    customer: "Klient",
    email: "E-mail",
    phone: "Telefon",
    address: "Adres",
    status: "Status",
    payment: "Płatność",
    delivery: "Dostawa",
    created_at: "Data utworzenia",
    total: "Wartość",
  },
  sets: {
    set_sku: "SKU zestawu",
    set_name: "Nazwa zestawu",
    child_sku: "SKU składnika",
    qty: "Ilość",
  },
  suppliers: {
    id: "ID",
    name: "Nazwa",
    code: "Kod",
    full_company_name: "Pełna nazwa firmy",
    tax_id: "NIP",
    email: "E-mail",
    phone: "Telefon",
    website: "Strona WWW",
    logo: "Logo",
    description: "Opis",
    address_country: "Kraj",
    address_city: "Miasto",
    address_postal_code: "Kod pocztowy",
    address_street: "Ulica",
    address_building_number: "Numer budynku",
    products_count: "Liczba produktów",
    products_list: "Produkty (lista)",
    products_ids: "ID produktów",
    created_at: "Data utworzenia",
    updated_at: "Data aktualizacji",
    address: "Adres (jedna linia)",
  },
  manufacturers: {
    id: "ID",
    name: "Nazwa",
    code: "Kod",
    full_company_name: "Pełna nazwa firmy",
    tax_id: "NIP",
    email: "E-mail",
    phone: "Telefon",
    website: "Strona WWW",
    logo: "Logo",
    description: "Opis",
    address_country: "Kraj",
    address_city: "Miasto",
    address_postal_code: "Kod pocztowy",
    address_street: "Ulica",
    address_building_number: "Numer budynku",
    products_count: "Liczba produktów",
    products_list: "Produkty (lista)",
    products_ids: "ID produktów",
    created_at: "Data utworzenia",
    updated_at: "Data aktualizacji",
  },
  cartons: {
    name: "Nazwa",
    width: "Szerokość (cm)",
    height: "Wysokość (cm)",
    depth: "Głębokość (cm)",
    weight: "Waga (kg)",
  },
  customers: {
    id: "ID",
    first_name: "Imię",
    last_name: "Nazwisko",
    email: "E-mail",
    phone: "Telefon",
    company_name: "Firma",
    nip: "NIP",
    city: "Miasto",
    postal_code: "Kod pocztowy",
    country: "Kraj",
    created_at: "Data utworzenia",
    orders_count: "Liczba zamówień",
    orders_total: "Łączna wartość zamówień",
    status: "Status",
  },
  label_templates: {},
};

export function csvFieldLabelPl(entity: ExportEntityType, field: string): string {
  return CSV_FIELD_LABEL_PL[entity]?.[field] ?? field;
}

/** Opcje wyboru typu importu w Ustawienia → Import. */
export const SETTINGS_IMPORT_KIND_OPTIONS = [
  { id: "orders" as const, label: "Zamówienia" },
  { id: "products" as const, label: "Produkty" },
  { id: "sets" as const, label: "Zestawy" },
  { id: "cartons" as const, label: "Kartony" },
  { id: "manufacturers" as const, label: "Producenci" },
  { id: "suppliers" as const, label: "Dostawcy" },
  { id: "customers" as const, label: "Klienci" },
  { id: "label_templates" as const, label: "Szablony etykiet" },
];

export type SettingsImportKindOption = (typeof SETTINGS_IMPORT_KIND_OPTIONS)[number]["id"];

/** Typy importowane przez {@link ImportPage} (CSV z mapowaniem kolumn). */
export type SettingsImportCsvKind = Exclude<SettingsImportKindOption, "label_templates">;

export function isSettingsImportCsvKind(k: SettingsImportKindOption): k is SettingsImportCsvKind {
  return k !== "label_templates";
}

export function isLabelTemplatesSettingsImportKind(k: SettingsImportKindOption): k is "label_templates" {
  return k === "label_templates";
}
