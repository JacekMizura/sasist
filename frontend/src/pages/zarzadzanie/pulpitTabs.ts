/**
 * Zakładki Pulpitu kierownika — TabsNav (jak Raporty / Plan zmian).
 */

export const PULPIT_ROOT = "/zarzadzanie-magazynem/pulpit";

export type PulpitTabId =
  | "decyzja"
  | "alerty"
  | "operatorzy"
  | "kolejki"
  | "dostawy"
  | "historia";

export type PulpitTabItem = {
  id: PulpitTabId;
  path: string;
  label: string;
  end?: boolean;
};

export const PULPIT_TABS: PulpitTabItem[] = [
  { id: "decyzja", path: PULPIT_ROOT, label: "Decyzja", end: true },
  { id: "alerty", path: `${PULPIT_ROOT}/alerty`, label: "Alerty" },
  { id: "operatorzy", path: `${PULPIT_ROOT}/operatorzy`, label: "Operatorzy" },
  { id: "kolejki", path: `${PULPIT_ROOT}/kolejki`, label: "Kolejki" },
  { id: "dostawy", path: `${PULPIT_ROOT}/dostawy`, label: "Dostawy" },
  { id: "historia", path: `${PULPIT_ROOT}/historia`, label: "Historia" },
];

export function getPulpitTabId(pathname: string): PulpitTabId {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === PULPIT_ROOT) return "decyzja";
  for (const tab of PULPIT_TABS) {
    if (tab.id === "decyzja") continue;
    if (normalized === tab.path || normalized.startsWith(`${tab.path}/`)) return tab.id;
  }
  return "decyzja";
}
