/**
 * Optymalizacja — planowanie + realizacja + historia efektów (Faza 4).
 */

export type OptimizeSubNavItem = { path: string; label: string };

export const OPTYMALIZACJA_SUB_NAV: OptimizeSubNavItem[] = [
  { path: "/optymalizacja", label: "Przegląd planu" },
  { path: "/optymalizacja/plan", label: "Plan zmian" },
  { path: "/optymalizacja/historia", label: "Historia zmian" },
  { path: "/optymalizacja/ranking", label: "Ranking zmian" },
  { path: "/optymalizacja/slotting", label: "Układ towaru" },
  { path: "/optymalizacja/picking-strategy", label: "Strategia kompletacji" },
  { path: "/optymalizacja/pick-path", label: "Trasy i dystans" },
];

export function getOptymalizacjaSubNav(pathname: string): OptimizeSubNavItem[] | null {
  if (pathname === "/optymalizacja" || pathname.startsWith("/optymalizacja/")) {
    return OPTYMALIZACJA_SUB_NAV;
  }
  return null;
}
