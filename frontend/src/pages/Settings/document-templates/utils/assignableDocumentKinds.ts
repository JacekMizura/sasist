import type { ScopeKindConfig } from "../components/DocumentTemplateScopeSection";
import {
  COMPANY_SCOPE_KINDS,
  COMPLAINTS_SCOPE_KINDS,
  ORDERS_SCOPE_KINDS,
  PRODUCT_SCOPE_KINDS,
  PRODUCTION_SCOPE_KINDS,
  RETURNS_SCOPE_KINDS,
  SUPPLIER_SCOPE_KINDS,
  WAREHOUSE_SCOPE_KINDS,
} from "../documentTemplateScopeKinds";

export type AssignableKind = ScopeKindConfig & { group: string; description: string };

const DESCRIPTIONS: Record<string, string> = {
  product_card: "Wydruk karty produktu w module produktów.",
  product_catalog: "Szablon katalogu produktów.",
  picking_list: "Lista kompletacyjna do realizacji zamówień.",
  order_confirmation: "Potwierdzenie zamówienia dla klienta.",
  invoice: "Faktura VAT w module sprzedaży.",
  receipt: "Paragon fiskalny.",
  correction: "Dokument korekty sprzedaży.",
  wz: "Wydanie zewnętrzne z magazynu.",
  pz: "Przyjęcie zewnętrzne do magazynu.",
  pw: "Przyjęcie wewnętrzne (produkcja).",
  rw: "Rozchód wewnętrzny.",
  mm: "Przesunięcie międzymagazynowe.",
  inventory_count: "Arkusz inwentaryzacji.",
  production_card: "Karta produkcyjna.",
  production_material_pick_list: "Lista pobrania materiałów na produkcję.",
  return_document: "Dokument zwrotu towaru.",
  complaint_document: "Dokument reklamacji.",
  supplier_order: "Zamówienie do dostawcy.",
};

const GROUPS: { group: string; kinds: ScopeKindConfig[] }[] = [
  { group: "Produkty", kinds: PRODUCT_SCOPE_KINDS },
  { group: "Zamówienia", kinds: ORDERS_SCOPE_KINDS },
  { group: "Magazyn", kinds: WAREHOUSE_SCOPE_KINDS },
  { group: "Firma", kinds: COMPANY_SCOPE_KINDS },
  { group: "Produkcja", kinds: PRODUCTION_SCOPE_KINDS },
  { group: "Zwroty", kinds: RETURNS_SCOPE_KINDS },
  { group: "Reklamacje", kinds: COMPLAINTS_SCOPE_KINDS },
  { group: "Dostawcy", kinds: SUPPLIER_SCOPE_KINDS },
];

export function allAssignableKinds(): AssignableKind[] {
  const out: AssignableKind[] = [];
  for (const g of GROUPS) {
    for (const k of g.kinds) {
      out.push({
        ...k,
        group: g.group,
        description: DESCRIPTIONS[k.kindCode] ?? `Wydruk typu „${k.label}”.`,
      });
    }
  }
  return out;
}

export function kindLabel(kindCode: string | null | undefined): string {
  if (!kindCode) return "Dokument";
  const hit = allAssignableKinds().find((k) => k.kindCode === kindCode);
  return hit?.label ?? kindCode;
}
