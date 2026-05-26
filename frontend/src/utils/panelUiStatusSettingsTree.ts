/** Sekcje według podgrupy w drzewie ustawień. `group_name` nie jest używane w UI ustawień. */

export type PanelUiStatusLike = {
  subgroup_name?: string | null;
};

export type PanelUiSubgroupBucket<T extends PanelUiStatusLike> = {
  subgroupKey: string;
  rows: T[];
};

/** @deprecated Użyj ``partitionStatusesBySubgroupForSettings``. */
export function bucketBySubgroupOrder<T extends PanelUiStatusLike>(subs: T[]): PanelUiSubgroupBucket<T>[] {
  const { ungrouped, subgroupBuckets } = partitionStatusesBySubgroupForSettings(subs);
  const out: PanelUiSubgroupBucket<T>[] = [];
  if (ungrouped.length) out.push({ subgroupKey: "", rows: ungrouped });
  for (const b of subgroupBuckets) out.push(b);
  return out;
}

/** Statusy bez podgrupy + listy z niepustą ``subgroup_name`` (kolejność pierwszego wystąpienia na liście). */
export function partitionStatusesBySubgroupForSettings<T extends PanelUiStatusLike>(subs: T[]): {
  ungrouped: T[];
  subgroupBuckets: PanelUiSubgroupBucket<T>[];
} {
  const ungrouped: T[] = [];
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const r of subs) {
    const s = (r.subgroup_name ?? "").trim();
    if (!s) {
      ungrouped.push(r);
      continue;
    }
    if (!map.has(s)) {
      map.set(s, []);
      order.push(s);
    }
    map.get(s)!.push(r);
  }
  return {
    ungrouped,
    subgroupBuckets: order.map((subgroupKey) => ({ subgroupKey, rows: map.get(subgroupKey)! })),
  };
}

export function subgroupSectionTitle(subgroupKey: string): string {
  return subgroupKey.trim();
}
