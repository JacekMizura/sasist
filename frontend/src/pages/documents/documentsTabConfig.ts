/** Primary horizontal tabs for `/documents/*` (Sellasist-style). */

export type DocumentsTabItem = {
  path: string;
  label: string;
  /** Optional group label for visual separation (e.g. Ustawienia). */
  group?: "operations" | "settings";
};

export const DOCUMENTS_TAB_ITEMS: DocumentsTabItem[] = [
  { path: "/documents/sales", label: "Dokumenty sprzedażowe", group: "operations" },
  { path: "/documents/correcting", label: "Korekty", group: "operations" },
  { path: "/documents/warehouse", label: "Dokumenty magazynowe", group: "operations" },
  { path: "/documents/series", label: "Serie dokumentów", group: "settings" },
  { path: "/documents/exports", label: "Eksporty", group: "settings" },
];

/** Which top tab is active for a pathname (prefix match under each tab root). */
export function activeDocumentsTabPath(pathname: string): string {
  const p = pathname.replace(/\/+$/, "") || pathname;

  // Legacy admin routes map to settings tabs
  if (p === "/documents/custom-fields" || p.startsWith("/documents/custom-fields/")) {
    return "/documents/series";
  }
  if (p === "/documents/ksef" || p.startsWith("/documents/ksef/")) {
    return "/documents/series";
  }

  for (const t of DOCUMENTS_TAB_ITEMS) {
    if (pathname === t.path || pathname.startsWith(`${t.path}/`)) return t.path;
  }
  return "/documents/sales";
}
