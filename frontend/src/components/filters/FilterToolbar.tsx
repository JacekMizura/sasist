import type { ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import type { ListViewActionsBinding } from "../../preferences/listView/listViewActionsTypes";
import { FilterApplyActions } from "./FilterApplyActions";
import {
  filterToolbarBtnGhost,
  filterToolbarBtnIconSquare,
  filterToolbarBtnSecondary,
  filterToolbarBtnToggle,
} from "./filterUiTokens";

export type FilterToolbarProps = {
  /** When set with onToggleExpanded, shows collapsible “Filtry” control. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onClear: () => void;
  /** Omitted when `showApply` is false (np. wyszukiwanie na żywo). */
  onApply?: () => void;
  showApply?: boolean;
  applyLabel?: string;
  clearLabel?: string;
  /** Shown next to primary actions (e.g. Eksport). */
  trailing?: ReactNode;
  /** “Widoczne pola” — opens field visibility UI. */
  onOpenFieldPicker?: () => void;
  showFieldPicker?: boolean;
  fieldPickerLabel?: string;
  /** Saved list views — split „Filtruj ▼” menu. */
  listView?: ListViewActionsBinding;
  /** Collapsible trigger copy when panel is open (e.g. „Ukryj filtry”). */
  expandedToggleLabel?: string;
  /** Collapsible trigger copy when panel is closed (e.g. „Pokaż filtry”). */
  collapsedToggleLabel?: string;
  /** Render „Widoczne pola” as icon-only square button. */
  fieldPickerIconOnly?: boolean;
  /** Extra trailing controls before field picker (e.g. settings icon). */
  trailingExtras?: ReactNode;
  /** When false, Filtruj / Wyczyść live only in panel footer ({@link FilterPanelBodyWithActions}). */
  showHeaderActions?: boolean;
  className?: string;
};

export function FilterToolbar({
  expanded,
  onToggleExpanded,
  onClear,
  onApply,
  showApply = true,
  applyLabel = "Zastosuj",
  clearLabel = "Wyczyść",
  trailing,
  onOpenFieldPicker,
  showFieldPicker,
  fieldPickerLabel = "Widoczne pola",
  listView,
  expandedToggleLabel,
  collapsedToggleLabel,
  fieldPickerIconOnly,
  trailingExtras,
  showHeaderActions = true,
  className = "",
}: FilterToolbarProps) {
  const collapsible = onToggleExpanded != null;
  const showActions = showHeaderActions && (!collapsible || expanded);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4 ${className}`.trim()}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggleExpanded}
            className={filterToolbarBtnToggle}
            aria-expanded={expanded ?? false}
          >
            {expanded
              ? (expandedToggleLabel ?? "Filtry")
              : (collapsedToggleLabel ?? "Filtry")}
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        ) : (
          <span className="text-sm font-semibold tracking-tight text-slate-800">Filtry</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {trailing}
        {trailingExtras}
        {showFieldPicker && onOpenFieldPicker ? (
          <button
            type="button"
            onClick={onOpenFieldPicker}
            title={fieldPickerLabel}
            aria-label={fieldPickerLabel}
            className={fieldPickerIconOnly ? filterToolbarBtnIconSquare : filterToolbarBtnGhost}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
            {fieldPickerIconOnly ? null : fieldPickerLabel}
          </button>
        ) : null}
        {showActions && showApply && onApply ? (
          <FilterApplyActions
            onClear={onClear}
            onApply={onApply}
            clearLabel={clearLabel}
            applyLabel={applyLabel}
            listView={listView}
          />
        ) : showActions ? (
          <button type="button" onClick={onClear} className={filterToolbarBtnSecondary}>
            {clearLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
