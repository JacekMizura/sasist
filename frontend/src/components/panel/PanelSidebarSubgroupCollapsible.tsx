import { useCallback, useEffect, useState, type ReactNode } from "react";

import { PanelSubgroupLineHeader } from "./PanelSubgroupLineHeader";
import { PANEL_TREE_SUBGROUP_CHILDREN_CLASS } from "./panelStatusTreeStyles";

type Props = {
  /** Unikalny klucz w sessionStorage (np. magazyn + grupa + sekcja). */
  storageKey: string;
  /** Dokładna nazwa z konfiguratora — bez normalizacji. */
  title: string;
  /** Suma liczników statusów w sekcji. */
  totalCount: number;
  children: ReactNode;
  /** Wyszukiwanie — wymusza rozwinięcie bez zapisu stanu. */
  forceExpanded?: boolean;
};

/**
 * Zwijana podgrupa panelu — nagłówek sekcji z linią (subtelniejszy niż grupa główna).
 * sessionStorage[key] === "0" => zwinięte; brak klucza / "1" => rozwinięte.
 */
export function PanelSidebarSubgroupCollapsible({
  storageKey,
  title,
  totalCount,
  children,
  forceExpanded = false,
}: Props) {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) !== "0";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (forceExpanded) setOpen(true);
  }, [forceExpanded]);

  const toggle = useCallback(() => {
    if (forceExpanded) return;
    setOpen((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        //
      }
      return next;
    });
  }, [forceExpanded, storageKey]);

  const expanded = forceExpanded || open;

  return (
    <div>
      <PanelSubgroupLineHeader title={title} totalCount={totalCount} expanded={expanded} onToggle={toggle} showCount={false} />
      {expanded ? <div className={PANEL_TREE_SUBGROUP_CHILDREN_CLASS}>{children}</div> : null}
    </div>
  );
}
