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
    const wh = items.filter((i) => i.series_type === "WAREHOUSE").map(navItemFromSeries).filter(Boolean) as DocumentsNavItem[];
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
