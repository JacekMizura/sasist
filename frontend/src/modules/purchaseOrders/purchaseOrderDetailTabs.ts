import type { TabsNavItem } from "../../components/layout/TabsNav";

export type PurchaseOrderEditTab = "basic" | "products";

const TAB_LABELS: Record<PurchaseOrderEditTab, string> = {
  basic: "Podstawowe",
  products: "Produkty",
};

export function purchaseOrderEditTabLabel(tab: PurchaseOrderEditTab): string {
  return TAB_LABELS[tab];
}

export function purchaseOrderDetailTabs(orderId: number, tenantId: number): TabsNavItem[] {
  const base = `/goods-orders/${orderId}`;
  const q = tenantId >= 1 ? `?tenant_id=${tenantId}` : "";

  return (Object.keys(TAB_LABELS) as PurchaseOrderEditTab[]).map((tab) => ({
    path: tab === "basic" ? `${base}${q}` : `${base}/${tab}${q}`,
    label: TAB_LABELS[tab],
    end: true,
  }));
}

export function parsePurchaseOrderEditTab(segment: string | undefined): PurchaseOrderEditTab {
  const allowed = new Set(Object.keys(TAB_LABELS));
  if (segment && allowed.has(segment)) return segment as PurchaseOrderEditTab;
  return "basic";
}
