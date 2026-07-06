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

export type AssignableKind = ScopeKindConfig & { group: string };

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
      out.push({ ...k, group: g.group });
    }
  }
  return out;
}

export function kindLabel(kindCode: string | null | undefined): string {
  if (!kindCode) return "Dokument";
  const hit = allAssignableKinds().find((k) => k.kindCode === kindCode);
  return hit?.label ?? kindCode;
}
