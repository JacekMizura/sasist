import {
  DOCUMENTS_CORRECTIONS_SIDEBAR,
  DOCUMENTS_NAV_SECTIONS,
  DOCUMENTS_SALES_SIDEBAR,
  DOCUMENTS_SETTINGS_SIDEBAR,
  DOCUMENTS_WAREHOUSE_SIDEBAR_STATIC,
  type DocumentsNavSection,
} from "./documentsNavConfig";
import { DOCUMENTS_TAB_ITEMS, activeDocumentsTabPath } from "./documentsTabConfig";

export type DocumentNavModule = "SALES" | "CORRECTION" | "WAREHOUSE" | "SETTINGS" | "OTHER";

/**
 * Aktywny „moduł” dokumentów wg ścieżki (zgodnie z główną zakładką Dokumenty).
 */
export function getCurrentDocumentModule(pathname: string): DocumentNavModule {
  const p = (pathname.replace(/\/+$/, "") || pathname).toLowerCase();
  if (p === "/documents/sales" || p.startsWith("/documents/sales/")) return "SALES";
  if (
    p === "/documents/correcting" ||
    p.startsWith("/documents/correcting/") ||
    p === "/documents/corrections" ||
    p.startsWith("/documents/corrections/") ||
    p === "/documents/returns" ||
    p.startsWith("/documents/returns/")
  ) {
    return "CORRECTION";
  }
  if (p === "/documents/warehouse" || p.startsWith("/documents/warehouse/")) return "WAREHOUSE";
  if (
    p.startsWith("/documents/series") ||
    p.startsWith("/documents/exports") ||
    p.startsWith("/documents/custom-fields") ||
    p.startsWith("/documents/ksef")
  ) {
    return "SETTINGS";
  }
  return "OTHER";
}

function tabLabelForRoot(tabRoot: string): string | undefined {
  return DOCUMENTS_TAB_ITEMS.find((t) => t.path === tabRoot)?.label;
}

/**
 * Sekcje lewego menu wyłącznie dla bieżącej zakładki — bez renderowania pozostałych.
 */
export function getDocumentsSidebarSections(pathname: string): DocumentsNavSection[] {
  const mod = getCurrentDocumentModule(pathname);

  if (mod === "SALES") {
    return [{ title: DOCUMENTS_SALES_SIDEBAR.title, items: [...DOCUMENTS_SALES_SIDEBAR.items] }];
  }
  if (mod === "CORRECTION") {
    return [{ title: DOCUMENTS_CORRECTIONS_SIDEBAR.title, items: [...DOCUMENTS_CORRECTIONS_SIDEBAR.items] }];
  }
  if (mod === "WAREHOUSE") {
    return [{ title: DOCUMENTS_WAREHOUSE_SIDEBAR_STATIC.title, items: [...DOCUMENTS_WAREHOUSE_SIDEBAR_STATIC.items] }];
  }
  if (mod === "SETTINGS") {
    return [{ title: DOCUMENTS_SETTINGS_SIDEBAR.title, items: [...DOCUMENTS_SETTINGS_SIDEBAR.items] }];
  }

  const tabRoot = activeDocumentsTabPath(pathname);
  const out: DocumentsNavSection[] = [];
  for (const sec of DOCUMENTS_NAV_SECTIONS) {
    const items = sec.items.filter((it) => it.path === tabRoot || it.path.startsWith(`${tabRoot}/`));
    if (items.length === 0) continue;
    const title = sec.title ?? tabLabelForRoot(tabRoot);
    out.push({ title, items });
  }
  return out;
}
