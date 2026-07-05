import type { ScopeKindConfig } from "./components/DocumentTemplateScopeSection";

export const COMPANY_SCOPE_KINDS: ScopeKindConfig[] = [
  { kindCode: "invoice", label: "Faktura VAT" },
  { kindCode: "receipt", label: "Paragon" },
  { kindCode: "correction", label: "Korekta" },
  { kindCode: "order_confirmation", label: "Potwierdzenie zamówienia" },
];

export const WAREHOUSE_SCOPE_KINDS: ScopeKindConfig[] = [
  { kindCode: "wz", label: "WZ" },
  { kindCode: "pz", label: "PZ" },
  { kindCode: "pw", label: "PW" },
  { kindCode: "rw", label: "RW" },
  { kindCode: "mm", label: "MM" },
  { kindCode: "inventory_count", label: "Inwentaryzacja" },
];

export const PRODUCTION_SCOPE_KINDS: ScopeKindConfig[] = [
  { kindCode: "production_card", label: "Karta produkcyjna" },
  { kindCode: "production_material_pick_list", label: "Lista pobrania materiałów" },
];

export const RETURNS_SCOPE_KINDS: ScopeKindConfig[] = [
  { kindCode: "return_document", label: "Dokument zwrotu" },
];

export const COMPLAINTS_SCOPE_KINDS: ScopeKindConfig[] = [
  { kindCode: "complaint_document", label: "Dokument reklamacji" },
];

export const ORDERS_SCOPE_KINDS: ScopeKindConfig[] = [
  { kindCode: "picking_list", label: "Lista kompletacyjna" },
  { kindCode: "order_confirmation", label: "Potwierdzenie zamówienia" },
];

export const PRODUCT_SCOPE_KINDS: ScopeKindConfig[] = [
  { kindCode: "product_card", label: "Karta produktu" },
  { kindCode: "product_catalog", label: "Katalog produktów" },
];

export const SUPPLIER_SCOPE_KINDS: ScopeKindConfig[] = [
  { kindCode: "supplier_order", label: "Zamówienie do dostawcy" },
];
