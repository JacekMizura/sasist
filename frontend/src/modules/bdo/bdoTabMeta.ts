export type BdoTabMeta = {
  title: string;
  description: string;
  breadcrumbLabel: string;
};

/** Meta for active BDO report/config tabs (materials catalog lives under Asortyment). */
const META: Record<string, BdoTabMeta> = {
  "/warehouse/bdo/dashboard": {
    title: "Dashboard BDO",
    description: "Podgląd materiałów opakowaniowych objętych raportowaniem środowiskowym.",
    breadcrumbLabel: "Dashboard",
  },
  "/warehouse/bdo/movements": {
    title: "Historia",
    description: "Ruchy wynikające z dokumentów magazynowych (PZ / RW).",
    breadcrumbLabel: "Historia",
  },
  "/warehouse/bdo/monthly-report": {
    title: "Raport miesięczny",
    description: "Raport BDO z przyjęć PZ i zużycia RW (w tym pakowanie).",
    breadcrumbLabel: "Raport miesięczny",
  },
  "/warehouse/bdo/settings": {
    title: "Ustawienia BDO",
    description: "Dane podmiotu i metodologia raportu.",
    breadcrumbLabel: "Ustawienia",
  },
};

/** Title/description map used by tab pages that do not need breadcrumb labels. */
export const BDO_TAB_META: Record<string, { title: string; description: string }> = Object.fromEntries(
  Object.entries(META).map(([path, meta]) => [
    path,
    { title: meta.title, description: meta.description },
  ]),
);

export function resolveBdoTabMeta(pathname: string): BdoTabMeta | null {
  if (META[pathname]) return META[pathname];
  const base = pathname.replace(/\/$/, "");
  return META[base] ?? null;
}
