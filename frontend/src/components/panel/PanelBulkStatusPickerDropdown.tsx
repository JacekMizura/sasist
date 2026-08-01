import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { PanelStatusHierarchyPicker } from "./PanelStatusHierarchyPicker";
import { PanelTreeStatusItem } from "./PanelTreeStatusItem";
import type {
  OrderUiMainGroup,
  OrderUiPanelSubgroupRead,
  OrderUiStatusPanelSummary,
  OrderUiStatusWithCount,
} from "../../types/orderUiStatus";

export type PanelBulkStatusPickerDropdownProps = {
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups?: OrderUiPanelSubgroupRead[] | null;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** Aktualnie wybrany status — trigger jak kafelek Panelu Statusów. */
  selectedStatusId?: number | null;
  /** `statusId` jako string (pusty = wyczyść etykietę). */
  onSelect: (statusId: string) => void;
};

function findStatus(
  summary: OrderUiStatusPanelSummary | null,
  id: number | null | undefined,
): { status: OrderUiStatusWithCount; mainGroup: OrderUiMainGroup } | null {
  if (summary == null || id == null || !Number.isFinite(id)) return null;
  for (const block of summary.groups ?? []) {
    const hit = block.sub_statuses.find((s) => s.id === id);
    if (hit) return { status: hit, mainGroup: block.main_group };
  }
  return null;
}

/**
 * Dropdown zmiany statusu panelu — trigger = {@link PanelTreeStatusItem} (SSOT z sidebara).
 */
export function PanelBulkStatusPickerDropdown({
  panelSummary,
  panelSubgroups,
  disabled = false,
  placeholder = "Wybierz status",
  ariaLabel = "Zmień status panelu",
  className = "",
  selectedStatusId = null,
  onSelect,
}: PanelBulkStatusPickerDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(
    () => findStatus(panelSummary, selectedStatusId),
    [panelSummary, selectedStatusId],
  );

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
        className="flex w-full min-w-0 items-center gap-2 rounded-lg text-left disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => {
          if (disabled || panelSummary == null) return;
          setOpen((v) => !v);
        }}
      >
        <span className="min-w-0 flex-1">
          {selected ? (
            <PanelTreeStatusItem
              compact
              name={selected.status.name}
              mainGroup={selected.mainGroup}
              colors={{
                color: selected.status.color,
                badge_color: selected.status.badge_color,
                background_color: selected.status.background_color,
                text_color: selected.status.text_color,
              }}
              imageUrl={selected.status.image_url}
              active={open}
            />
          ) : (
            <span className="inline-flex h-[34px] w-full max-w-full items-center rounded-lg border border-dashed border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-400">
              {placeholder}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && panelSummary != null ? (
        <div
          className="absolute left-0 top-full z-[200] mt-1 w-[min(100vw-2rem,18rem)] overflow-hidden rounded-lg border border-slate-200/95 bg-white shadow-xl ring-1 ring-slate-200/60"
          role="listbox"
          aria-label={ariaLabel}
        >
          <PanelStatusHierarchyPicker
            panelSummary={panelSummary}
            panelSubgroups={panelSubgroups}
            selectedStatusId={selectedStatusId}
            disabled={disabled}
            showClearOption
            clearLabel="Bez etykiety"
            onPick={handlePick}
            listMaxHeightClass="max-h-[min(65vh,24rem)]"
          />
        </div>
      ) : null}
    </div>
  );
}
