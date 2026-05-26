/** Primary horizontal tabs for `/documents/*` (Sellasist-style). */

export type DocumentsTabItem = {
  path: string;
  label: string;
};

export const DOCUMENTS_TAB_ITEMS: DocumentsTabItem[] = [
  { path: "/documents/sales", label: "Dokumenty sprzedaży" },
  { path: "/documents/correcting", label: "Dokumenty korygujące" },
  { path: "/documents/warehouse", label: "Dokumenty magazynowe" },
  { path: "/documents/exports", label: "Eksporty" },
  { path: "/documents/series", label: "Serie dokumentów" },
  { path: "/documents/custom-fields", label: "Pola własne" },
  { path: "/documents/ksef", label: "Konta KSeF" },
];

/** Which top tab is active for a pathname (prefix match under each tab root). */
export function activeDocumentsTabPath(pathname: string): string {
  for (const t of DOCUMENTS_TAB_ITEMS) {
    if (pathname === t.path || pathname.startsWith(`${t.path}/`)) return t.path;
  }
  return "/documents/sales";
}
