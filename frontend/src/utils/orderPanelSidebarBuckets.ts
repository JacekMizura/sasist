export type PanelSubgroupDefLike = {
  main_group: string;
  name: string;
  sort_order: number;
};

export type HasSubgroupName = {
  subgroup_name?: string | null;
};

/** Wynik grupowania w sidebarze: bez sztucznej sekcji „Bez przypisania”. */
export type PanelSidebarLayoutResult<T> = {
  /** Statusy bez podgrupy — bezpośrednio pod grupą główną. */
  ungrouped: T[];
  /** Tylko rzeczywiste podgrupy (z definicji lub z nazw na statusach). */
  subgroupSections: { key: string; title: string; rows: T[] }[];
};

/**
 * Kolejność: sekcje zdefiniowanych podgrup (wg sort_order) → pozostałe nazwy z statusów.
 * Statusy z pustą podgrupą trafiają do ``ungrouped`` (render bez nagłówka podgrupy).
 */
export function buildPanelSidebarLayout<T extends HasSubgroupName>(
  mainGroup: string,
  statuses: T[],
  defs: PanelSubgroupDefLike[],
): PanelSidebarLayoutResult<T> {
  const mg = String(mainGroup || "").toUpperCase();
  const defsMg = defs
    .filter((d) => String(d.main_group).toUpperCase() === mg)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "pl"));
  const bySub = new Map<string, T[]>();
  for (const r of statuses) {
    const k = (r.subgroup_name ?? "").trim();
    if (!bySub.has(k)) bySub.set(k, []);
    bySub.get(k)!.push(r);
  }
  const loose = bySub.get("") ?? [];
  const used = new Set<string>();
  const subgroupSections: { key: string; title: string; rows: T[] }[] = [];
  for (const d of defsMg) {
    const k = d.name.trim();
    const list = bySub.get(k);
    if (list?.length) {
      subgroupSections.push({ key: `def-${d.sort_order}-${d.name}`, title: d.name, rows: list });
      used.add(k);
    }
  }
  const orphanKeys = [...bySub.keys()].filter((k) => !used.has(k) && k !== "");
  orphanKeys.sort((a, b) => a.localeCompare(b, "pl"));
  for (const k of orphanKeys) {
    subgroupSections.push({ key: `orph-${k}`, title: k, rows: bySub.get(k)! });
  }
  return { ungrouped: loose, subgroupSections };
}
