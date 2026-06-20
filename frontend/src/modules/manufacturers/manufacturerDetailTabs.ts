import type { TabsNavItem } from "../../components/layout/TabsNav";

export type ManufacturerEditTab =
  | "basic"
  | "address"
  | "contact"
  | "mproducts"
  | "msuppliers"
  | "stats"
  | "gpsr";

const TAB_LABELS: Record<ManufacturerEditTab, string> = {
  basic: "Podstawowe",
  address: "Adres",
  contact: "Kontakt",
  mproducts: "Produkty",
  msuppliers: "Dostawcy",
  stats: "Statystyki",
  gpsr: "GPSR",
};

export function manufacturerEditTabLabel(tab: ManufacturerEditTab): string {
  return TAB_LABELS[tab];
}

export function manufacturerDetailTabs(
  manufacturerId: number | "new",
  tenantId: number,
): TabsNavItem[] {
  const base = manufacturerId === "new" ? "/manufacturers/new" : `/manufacturers/${manufacturerId}`;
  const q = tenantId >= 1 ? `?tenant_id=${tenantId}` : "";

  return (Object.keys(TAB_LABELS) as ManufacturerEditTab[]).map((tab) => ({
    path: tab === "basic" ? `${base}${q}` : `${base}/${tab}${q}`,
    label: TAB_LABELS[tab],
    end: true,
  }));
}

export function parseManufacturerEditTab(segment: string | undefined): ManufacturerEditTab {
  const allowed = new Set(Object.keys(TAB_LABELS));
  if (segment && allowed.has(segment)) return segment as ManufacturerEditTab;
  return "basic";
}
