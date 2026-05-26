import { useCallback, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  panelSidebarSubgroupHeaderCountBadgeClass,
  panelSidebarSubgroupRowClass,
} from "../../utils/panelSidebarHierarchy";

type Props = {
  /** Unikalny klucz w sessionStorage (np. magazyn + grupa + sekcja). */
  storageKey: string;
  title: string;
  /** Suma liczników statusów w sekcji. */
  totalCount: number;
  children: ReactNode;
};

/**
 * Nagłówek podgrupy w sidebarze panelu: wyraźna sekcja, strzałka, zwijanie z pamięcią w sesji.
 * sessionStorage[key] === "0" => zwinięte
 * brak klucza / "1" => rozwinięte
 */
export function PanelSidebarSubgroupCollapsible({
  storageKey,
  title,
  totalCount,
  children,
}: Props) {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) !== "0";
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;

      try {
        sessionStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        //
      }

      return next;
    });
  }, [storageKey]);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={toggle}
        className={panelSidebarSubgroupRowClass()}
      >
        {/* strzałka */}
        <span className="flex items-center justify-center">
          {open ? (
            <ChevronDown
              className="h-3 w-3 text-slate-500"
              strokeWidth={2.25}
              aria-hidden
            />
          ) : (
            <ChevronRight
              className="h-3 w-3 text-slate-500"
              strokeWidth={2.25}
              aria-hidden
            />
          )}
        </span>

        {/* tytuł */}
        <span className="truncate text-center tracking-normal">
          {title}
        </span>

        {/* badge */}
        <span className={panelSidebarSubgroupHeaderCountBadgeClass()}>
          {totalCount}
        </span>
      </button>

      {open ? (
        <div className="mt-0.5 space-y-1 pl-0.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}