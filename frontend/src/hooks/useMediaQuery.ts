import { useSyncExternalStore } from "react";

/** Subskrypcja `matchMedia` — użyte m.in. żeby nie montować dwóch dropdownów (mobile/desktop) jednocześnie. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
