import type { TabsNavItem } from "../../components/layout/TabsNav";

export type SupplierEditTab = "basic" | "contact" | "products" | "trade" | "stats" | "history";

const TAB_LABELS: Record<SupplierEditTab, string> = {
  basic: "Podstawowe",
  contact: "Kontakt",
  products: "Produkty",
  trade: "Warunki handlowe",
  stats: "Statystyki",
  history: "Historia",
};

export function supplierEditTabLabel(tab: SupplierEditTab): string {
  return TAB_LABELS[tab];
}

export function supplierDetailTabs(supplierId: number | "new", tenantId: number): TabsNavItem[] {
  const base = supplierId === "new" ? "/suppliers/new" : `/suppliers/${supplierId}`;
  const q = tenantId >= 1 ? `?tenant_id=${tenantId}` : "";

  return (Object.keys(TAB_LABELS) as SupplierEditTab[]).map((tab) => ({
    path: tab === "basic" ? `${base}${q}` : `${base}/${tab}${q}`,
    label: TAB_LABELS[tab],
    end: true,
  }));
}

export function parseSupplierEditTab(segment: string | undefined): SupplierEditTab {
  const allowed = new Set(Object.keys(TAB_LABELS));
  if (segment && allowed.has(segment)) return segment as SupplierEditTab;
  return "basic";
}
