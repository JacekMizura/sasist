import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Download,
  FileText,
  Landmark,
  Library,
  Package,
  Receipt,
  ScrollText,
  Truck,
  Columns3,
} from "lucide-react";

import type { OperationalDocumentSeriesDto } from "../../api/documentSeriesApi";
import { DOCUMENTS_NAV_SECTIONS, type DocumentsNavItem, type DocumentsNavSection } from "./documentsNavConfig";

const WAREHOUSE_NAV_ORDER = ["MM", "PZ", "PW", "RW", "WZ", "ZD", "Z-PZ", "ZW"];

function iconForOperationalItem(item: OperationalDocumentSeriesDto): LucideIcon {
  const code = item.operational_code.toUpperCase();
  if (code === "FV") return FileText;
  if (code === "PA") return Receipt;
  if (code === "KOR") return ScrollText;
  if (code === "WZ") return Truck;
  if (code === "MM") return ArrowLeftRight;
  return Package;
}

function navItemFromSeries(item: OperationalDocumentSeriesDto): DocumentsNavItem | null {
  const path = item.list_path?.trim();
  if (!path) return null;
  return {
    path,
    label: item.operational_code,
    Icon: iconForOperationalItem(item),
  };
}

function sortWarehouseNavItems(items: DocumentsNavItem[]): DocumentsNavItem[] {
  return [...items].sort((a, b) => {
    const ia = WAREHOUSE_NAV_ORDER.indexOf(a.label.toUpperCase());
    const ib = WAREHOUSE_NAV_ORDER.indexOf(b.label.toUpperCase());
    const ra = ia >= 0 ? ia : WAREHOUSE_NAV_ORDER.length;
    const rb = ib >= 0 ? ib : WAREHOUSE_NAV_ORDER.length;
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label, "pl");
  });
}

function dedupeNavItems(items: DocumentsNavItem[]): DocumentsNavItem[] {
  const seen = new Set<string>();
  const out: DocumentsNavItem[] = [];
  for (const item of items) {
    const key = item.path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Series-driven sidebar sections — only configured operational types appear. */
export function buildDocumentsSidebarFromCatalog(
  pathname: string,
  catalogItems: OperationalDocumentSeriesDto[] | null | undefined,
): DocumentsNavSection[] {
  const items = catalogItems ?? [];
  const p = (pathname.replace(/\/+$/, "") || pathname).toLowerCase();

  if (p === "/documents/sales" || p.startsWith("/documents/sales/")) {
    const saleItems = items.filter((i) => i.series_type === "SALE").map(navItemFromSeries).filter(Boolean) as DocumentsNavItem[];
    return saleItems.length ? [{ title: "Sprzedaż", items: saleItems }] : [];
  }

  if (
    p === "/documents/correcting" ||
    p.startsWith("/documents/correcting/") ||
    p === "/documents/corrections" ||
    p.startsWith("/documents/corrections/")
  ) {
    const corr = items.filter((i) => i.series_type === "CORRECTION").map(navItemFromSeries).filter(Boolean) as DocumentsNavItem[];
    return corr.length ? [{ title: "Korekty", items: corr }] : [];
  }

  if (p === "/documents/warehouse" || p.startsWith("/documents/warehouse/")) {
    const wh = sortWarehouseNavItems(
      dedupeNavItems(
        items.filter((i) => i.series_type === "WAREHOUSE").map(navItemFromSeries).filter(Boolean) as DocumentsNavItem[],
      ),
    );
    return wh.length ? [{ title: "Magazyn", items: wh }] : [];
  }

  // Admin / settings tabs — static fallbacks from legacy config
  const staticSec = DOCUMENTS_NAV_SECTIONS.filter((s) => !s.title || !["Sprzedaż", "Korekty", "Magazynowe"].includes(s.title));
  return staticSec.map((s) => ({ title: s.title, items: [...s.items] }));
}

export const DOCUMENTS_ADMIN_NAV_ICONS = {
  exports: Download,
  series: Library,
  customFields: Columns3,
  ksef: Landmark,
} as const;
