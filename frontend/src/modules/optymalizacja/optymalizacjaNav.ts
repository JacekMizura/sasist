/**
 * Plan zmian — pod /zarzadzanie-magazynem/plan-zmian
 */

import { PLAN_ZMIAN_PATH } from "../analizy/analizyModuleNav";

export type OptimizeSubNavItem = { path: string; label: string };

export const OPTYMALIZACJA_SUB_NAV: OptimizeSubNavItem[] = [
  { path: PLAN_ZMIAN_PATH, label: "Przegląd harmonogramu" },
  { path: `${PLAN_ZMIAN_PATH}/plan`, label: "Harmonogram zmian" },
  { path: `${PLAN_ZMIAN_PATH}/historia`, label: "Historia zmian" },
  { path: `${PLAN_ZMIAN_PATH}/ranking`, label: "Klasyfikacja efektów" },
  { path: `${PLAN_ZMIAN_PATH}/slotting`, label: "Układ towaru" },
  { path: `${PLAN_ZMIAN_PATH}/picking-strategy`, label: "Strategia kompletacji" },
  { path: `${PLAN_ZMIAN_PATH}/pick-path`, label: "Trasy i dystans" },
];

export function getOptymalizacjaSubNav(pathname: string): OptimizeSubNavItem[] | null {
  if (pathname === PLAN_ZMIAN_PATH || pathname.startsWith(`${PLAN_ZMIAN_PATH}/`)) {
    return OPTYMALIZACJA_SUB_NAV;
  }
  // Legacy URLs (redirected) — still show sub-nav while resolving
  if (pathname === "/optymalizacja" || pathname.startsWith("/optymalizacja/")) {
    return OPTYMALIZACJA_SUB_NAV;
  }
  return null;
}
