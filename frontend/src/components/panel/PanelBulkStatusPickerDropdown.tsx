import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { PanelStatusHierarchyPicker } from "./PanelStatusHierarchyPicker";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";

export type PanelBulkStatusPickerDropdownProps = {
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups?: OrderUiPanelSubgroupRead[] | null;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** `statusId` jako string (pusty = wyczyść etykietę). */
  onSelect: (statusId: string) => void;
};

/**
 * Dropdown masowej zmiany statusu panelu — trigger jak select + hierarchiczna lista.
 */
export function PanelBulkStatusPickerDropdown({
  panelSummary,
  panelSubgroups,
  disabled = false,
  placeholder = "Wybierz akcję",
  ariaLabel = "Zmień status panelu",
  className = "",
  onSelect,
}: PanelBulkStatusPickerDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handlePick = (statusId: number | null) => {
    setOpen(false);
    onSelect(statusId == null ? "" : String(statusId));
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled || panelSummary == null}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="inline-flex h-9 max-w-[14rem] min-w-[10rem] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => {
          if (disabled || panelSummary == null) return;
          setOpen((v) => !v);
        }}
      >
        <span className="truncate text-slate-600">{placeholder}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && panelSummary != null ? (
        <div
          className="absolute left-0 top-full z-[200] mt-1 w-[min(100vw-2rem,20rem)] overflow-hidden rounded-lg border border-slate-200/95 bg-white shadow-xl ring-1 ring-slate-200/60"
          role="listbox"
          aria-label={ariaLabel}
        >
          <PanelStatusHierarchyPicker
            panelSummary={panelSummary}
            panelSubgroups={panelSubgroups}
            disabled={disabled}
            showClearOption
            clearLabel="Bez etykiety (wyczyść)"
            onPick={handlePick}
            listMaxHeightClass="max-h-[min(65vh,24rem)]"
          />
        </div>
      ) : null}
    </div>
  );
}
