import type { ExportEntityType } from "../api/exportsApi";

/** Grupy pól w edytorze szablonu eksportu — spójne z operacyjnym UI WMS. */
export type ExportFieldSection = { id: string; title: string; fields: readonly string[] };

export const EXPORT_FIELD_SECTIONS: Partial<Record<ExportEntityType, readonly ExportFieldSection[]>> = {
  products: [
    { id: "core", title: "Dane podstawowe", fields: ["id", "name", "sku", "ean"] },
    { id: "pricing", title: "Cena i magazyn", fields: ["price", "stock", "location"] },
    { id: "taxonomy", title: "Klasyfikacja", fields: ["category", "brand", "supplier"] },
    { id: "system", title: "System", fields: ["created_at"] },
  ],
  orders: [
    { id: "core", title: "Dane podstawowe", fields: ["id", "external_id", "status", "created_at", "total"] },
    { id: "customer", title: "Klient i kontakt", fields: ["customer", "email", "phone"] },
    { id: "fulfillment", title: "Realizacja", fields: ["address", "payment", "delivery"] },
  ],
  sets: [{ id: "all", title: "Skład zestawu", fields: ["set_sku", "set_name", "child_sku", "qty"] }],
  cartons: [{ id: "all", title: "Karton", fields: ["name", "width", "height", "depth", "weight"] }],
  suppliers: [
    { id: "core", title: "Dane podstawowe", fields: ["id", "name", "code", "full_company_name", "tax_id"] },
    { id: "contact", title: "Kontakt", fields: ["email", "phone", "website", "logo", "description"] },
    { id: "address", title: "Adres", fields: ["address_country", "address_city", "address_postal_code", "address_street", "address_building_number", "address"] },
    { id: "products", title: "Produkty powiązane", fields: ["products_count", "products_list", "products_ids"] },
    { id: "system", title: "System", fields: ["created_at", "updated_at"] },
  ],
  manufacturers: [
    { id: "core", title: "Dane podstawowe", fields: ["id", "name", "code", "full_company_name", "tax_id"] },
    { id: "contact", title: "Kontakt", fields: ["email", "phone", "website", "logo", "description"] },
    { id: "address", title: "Adres", fields: ["address_country", "address_city", "address_postal_code", "address_street", "address_building_number"] },
    { id: "products", title: "Produkty powiązane", fields: ["products_count", "products_list", "products_ids"] },
    { id: "system", title: "System", fields: ["created_at", "updated_at"] },
  ],
  customers: [
    { id: "core", title: "Dane podstawowe", fields: ["id", "first_name", "last_name", "company_name", "status"] },
    { id: "contact", title: "Kontakt", fields: ["email", "phone", "nip"] },
    { id: "address", title: "Adres (domyślny)", fields: ["city", "postal_code", "country"] },
    { id: "stats", title: "Statystyki zamówień", fields: ["orders_count", "orders_total"] },
    { id: "system", title: "System", fields: ["created_at"] },
  ],
};
