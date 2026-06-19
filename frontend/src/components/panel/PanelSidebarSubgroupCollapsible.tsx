import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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

const SUBGROUP_HEAD =
  "flex w-full min-h-[28px] items-center gap-1 rounded-md py-1 pl-0.5 pr-1 text-left text-[12px] font-semibold leading-tight text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

/**
 * Zwijana podgrupa panelu — pełnoprawny poziom hierarchii (Compact ERP).
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
    <div className="space-y-0.5">
      <button type="button" onClick={toggle} className={SUBGROUP_HEAD} aria-expanded={expanded}>
        <span className="flex w-4 shrink-0 items-center justify-center text-slate-400">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-slate-700">{title}</span>
        <span className="shrink-0 tabular-nums text-xs font-medium text-slate-400">{totalCount}</span>
      </button>
      {expanded ? <div className="space-y-0.5 pl-4">{children}</div> : null}
    </div>
  );
}
