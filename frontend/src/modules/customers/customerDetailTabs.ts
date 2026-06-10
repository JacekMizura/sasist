import type { TabsNavItem } from "../../components/layout/TabsNav";

export function customerDetailTabs(baseId: number): TabsNavItem[] {
  const base = `/customers/${baseId}`;
  return [
    { path: base, label: "Dane klienta", end: true },
    { path: `${base}/historia-zakupow`, label: "Historia zakupów" },
    { path: `${base}/aktywnosc`, label: "Aktywność" },
    { path: `${base}/notatki`, label: "Notatki" },
    { path: `${base}/dokumenty`, label: "Dokumenty" },
  ];
}
