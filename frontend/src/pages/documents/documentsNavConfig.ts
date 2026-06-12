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
  Warehouse,
} from "lucide-react";

export type DocumentsNavItem = {
  path: string;
  label: string;
  Icon: LucideIcon;
};

export type DocumentsNavSection = {
  title?: string;
  items: DocumentsNavItem[];
};

/** Sidebar inside Dokumenty sprzedażowe — szczegóły typów. */
export const DOCUMENTS_SALES_SIDEBAR: DocumentsNavSection = {
  title: "Sprzedaż",
  items: [
    { path: "/documents/sales/invoices", label: "Faktury", Icon: FileText },
    { path: "/documents/sales/receipts", label: "Paragony", Icon: Receipt },
  ],
};

/** Sidebar inside Korekty — rozszerzalne o kolejne typy korekt. */
export const DOCUMENTS_CORRECTIONS_SIDEBAR: DocumentsNavSection = {
  title: "Korekty",
  items: [{ path: "/documents/correcting", label: "Korekty sprzedaży", Icon: ScrollText }],
};

/**
 * Sidebar inside Dokumenty magazynowe — statyczny fallback; katalog serii może dodać RW, PW, RK, …
 */
export const DOCUMENTS_WAREHOUSE_SIDEBAR_STATIC: DocumentsNavSection = {
  title: "Magazyn",
  items: [
    { path: "/documents/warehouse/pz", label: "PZ", Icon: Package },
    { path: "/documents/warehouse/wz", label: "WZ", Icon: Truck },
    { path: "/documents/warehouse/mm", label: "MM", Icon: ArrowLeftRight },
  ],
};

/** Sidebar w zakładce ustawień modułu Dokumenty. */
export const DOCUMENTS_SETTINGS_SIDEBAR: DocumentsNavSection = {
  title: "Ustawienia",
  items: [
    { path: "/documents/series", label: "Serie dokumentów", Icon: Library },
    { path: "/documents/exports", label: "Eksporty", Icon: Download },
  ],
};

/**
 * Wszystkie sekcje boczne (używane przez documentsNavModule i fallbacki katalogu).
 */
export const DOCUMENTS_NAV_SECTIONS: DocumentsNavSection[] = [
  DOCUMENTS_SALES_SIDEBAR,
  DOCUMENTS_CORRECTIONS_SIDEBAR,
  DOCUMENTS_WAREHOUSE_SIDEBAR_STATIC,
  DOCUMENTS_SETTINGS_SIDEBAR,
];

/**
 * Główne menu fly-out kategorii „Dokumenty” — tylko wejścia do modułów (bez PZ/WZ/FV w root).
 */
export const DOCUMENTS_MAIN_FLYOUT_SECTIONS: DocumentsNavSection[] = [
  {
    title: "Sprzedaż",
    items: [{ path: "/documents/sales", label: "Dokumenty sprzedażowe", Icon: FileText }],
  },
  {
    title: "Korekty",
    items: [{ path: "/documents/correcting", label: "Korekty", Icon: ScrollText }],
  },
  {
    title: "Magazyn",
    items: [{ path: "/documents/warehouse", label: "Dokumenty magazynowe", Icon: Warehouse }],
  },
  DOCUMENTS_SETTINGS_SIDEBAR,
];

/** Legacy routes — poza menu, zachowane dla starych linków. */
export const DOCUMENTS_LEGACY_NAV_ITEMS = {
  customFields: { path: "/documents/custom-fields", label: "Pola własne" },
  ksef: { path: "/documents/ksef", label: "Konta KSeF" },
} as const;

export const DOCUMENTS_ADMIN_NAV_ICONS = {
  exports: Download,
  series: Library,
  ksef: Landmark,
} as const;

export function documentsNavFlatPaths(): string[] {
  return DOCUMENTS_MAIN_FLYOUT_SECTIONS.flatMap((s) => s.items.map((i) => i.path));
}
