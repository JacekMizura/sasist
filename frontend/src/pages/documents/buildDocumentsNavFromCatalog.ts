import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Download,
  FileText,
  Library,
  Package,
  Receipt,
  ScrollText,
  Truck,
} from "lucide-react";

import type { OperationalDocumentSeriesDto } from "../../api/documentSeriesApi";
import {
  DOCUMENTS_CORRECTIONS_SIDEBAR,
  DOCUMENTS_SALES_SIDEBAR,
  DOCUMENTS_SETTINGS_SIDEBAR,
  DOCUMENTS_WAREHOUSE_SIDEBAR_STATIC,
  type DocumentsNavItem,
  type DocumentsNavSection,
} from "./documentsNavConfig";

const WAREHOUSE_NAV_ORDER = ["MM", "PZ", "PW", "RW", "RK", "WZ", "INW", "RMZ", "ZD", "Z-PZ", "ZW"];

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
  const seenPaths = new Set<string>();
  const seenLabels = new Set<string>();
  const out: DocumentsNavItem[] = [];
  for (const item of items) {
    const pathKey = item.path.toLowerCase();
    const labelKey = item.label.trim().toUpperCase();
    if (seenPaths.has(pathKey) || seenLabels.has(labelKey)) continue;
    seenPaths.add(pathKey);
    seenLabels.add(labelKey);
    out.push(item);
  }
  return out;
}

function sectionWithFallback(
  title: string,
  catalogItems: DocumentsNavItem[],
  fallback: DocumentsNavSection,
): DocumentsNavSection[] {
  const items = catalogItems.length > 0 ? catalogItems : fallback.items;
  return items.length ? [{ title, items }] : [];
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
    return sectionWithFallback("Sprzedaż", saleItems, DOCUMENTS_SALES_SIDEBAR);
  }

  if (
    p === "/documents/correcting" ||
    p.startsWith("/documents/correcting/") ||
    p === "/documents/corrections" ||
    p.startsWith("/documents/corrections/") ||
    p === "/documents/returns" ||
    p.startsWith("/documents/returns/")
  ) {
    const corr = items.filter((i) => i.series_type === "CORRECTION").map(navItemFromSeries).filter(Boolean) as DocumentsNavItem[];
    return sectionWithFallback("Korekty", corr, DOCUMENTS_CORRECTIONS_SIDEBAR);
  }

  if (p === "/documents/warehouse" || p.startsWith("/documents/warehouse/")) {
    const wh = sortWarehouseNavItems(
      dedupeNavItems(
        items.filter((i) => i.series_type === "WAREHOUSE").map(navItemFromSeries).filter(Boolean) as DocumentsNavItem[],
      ),
    );
    return sectionWithFallback("Magazyn", wh, DOCUMENTS_WAREHOUSE_SIDEBAR_STATIC);
  }

  if (
    p.startsWith("/documents/series") ||
    p.startsWith("/documents/exports") ||
    p.startsWith("/documents/custom-fields") ||
    p.startsWith("/documents/ksef")
  ) {
    return [{ title: DOCUMENTS_SETTINGS_SIDEBAR.title, items: [...DOCUMENTS_SETTINGS_SIDEBAR.items] }];
  }

  return [];
}

export { DOCUMENTS_SETTINGS_SIDEBAR };
