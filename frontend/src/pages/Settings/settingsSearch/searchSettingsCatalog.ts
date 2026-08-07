import type { WmsSettingsSearchEntry, WmsSettingsSearchHit } from "./types";

const MIN_QUERY_LEN = 3;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function scoreEntry(entry: WmsSettingsSearchEntry, q: string): number {
  const nq = normalize(q);
  if (nq.length < MIN_QUERY_LEN) return 0;

  const label = normalize(entry.label);
  const desc = normalize(entry.description ?? "");
  const section = normalize(entry.sectionLabel);
  const group = normalize(entry.groupLabel ?? "");
  const tab = normalize(entry.tabLabel);
  const keywords = normalize((entry.keywords ?? []).join(" "));

  if (label === nq) return 100;
  if (label.startsWith(nq)) return 90;
  if (label.includes(nq)) return 80;
  if (group.includes(nq)) return 70;
  if (desc.includes(nq)) return 60;
  if (section.includes(nq)) return 50;
  if (tab.includes(nq)) return 40;
  if (keywords.includes(nq)) return 35;
  if (normalize(entry.id).includes(nq.replace(/\s+/g, "_"))) return 30;
  return 0;
}

export function searchWmsSettingsCatalog(
  catalog: readonly WmsSettingsSearchEntry[],
  query: string,
  limit = 40,
): WmsSettingsSearchHit[] {
  const q = query.trim();
  if (q.length < MIN_QUERY_LEN) return [];

  const hits: WmsSettingsSearchHit[] = [];
  for (const entry of catalog) {
    const score = scoreEntry(entry, q);
    if (score > 0) hits.push({ ...entry, score });
  }
  hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "pl"));
  return hits.slice(0, limit);
}

export const WMS_SETTINGS_SEARCH_MIN_CHARS = MIN_QUERY_LEN;
