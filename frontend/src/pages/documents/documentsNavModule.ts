import { DOCUMENTS_NAV_SECTIONS, type DocumentsNavSection } from "./documentsNavConfig";
import { DOCUMENTS_TAB_ITEMS, activeDocumentsTabPath } from "./documentsTabConfig";

export type DocumentNavModule = "SALES" | "CORRECTION" | "WAREHOUSE" | "OTHER";

/**
 * Aktywny „moduł” dokumentów wg ścieżki (zgodnie z główną zakładką Dokumenty).
 * `/documents/corrections` traktowane jak korekty, jeśli kiedyś pojawi się taka trasa.
 */
export function getCurrentDocumentModule(pathname: string): DocumentNavModule {
  const p = (pathname.replace(/\/+$/, "") || pathname).toLowerCase();
  if (p === "/documents/sales" || p.startsWith("/documents/sales/")) return "SALES";
  if (
    p === "/documents/correcting" ||
    p.startsWith("/documents/correcting/") ||
    p === "/documents/corrections" ||
    p.startsWith("/documents/corrections/")
  ) {
    return "CORRECTION";
  }
  if (p === "/documents/warehouse" || p.startsWith("/documents/warehouse/")) return "WAREHOUSE";
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
    const sec = DOCUMENTS_NAV_SECTIONS.find((s) => s.title === "Sprzedaż");
    return sec ? [{ title: "Sprzedaż", items: [...sec.items] }] : [];
  }
  if (mod === "CORRECTION") {
    const sec = DOCUMENTS_NAV_SECTIONS.find((s) => s.title === "Korekty");
    return sec ? [{ title: "Korekty", items: [...sec.items] }] : [];
  }
  if (mod === "WAREHOUSE") {
    const sec = DOCUMENTS_NAV_SECTIONS.find((s) => s.title === "Magazynowe");
    return sec ? [{ title: "Magazyn", items: [...sec.items] }] : [];
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
