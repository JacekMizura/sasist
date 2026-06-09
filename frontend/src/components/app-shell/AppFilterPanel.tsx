import type { ReactNode } from "react";

import { FilterPanel, FilterPanelBodyWithActions, FilterToolbar } from "../filters";
import { filterEmbeddedPanelClass } from "../filters/filterUiTokens";
import { moduleListFilterPanelBareClass } from "../listPage/moduleListLayoutTokens";

export type AppFilterPanelProps = {
  children: ReactNode;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onClear: () => void;
  onApply: () => void;
  applyLabel?: string;
  clearLabel?: string;
  showFieldPicker?: boolean;
  onOpenFieldPicker?: () => void;
  fieldPickerLabel?: string;
  /** Extra controls in toolbar row (export, presets) — never Filtruj/Wyczyść. */
  trailing?: ReactNode;
  className?: string;
};

/**
 * Global filter panel — actions (Filtruj / Wyczyść filtry) always at the bottom of the form.
 */
export function AppFilterPanel({
  children,
  expanded,
  onToggleExpanded,
  onClear,
  onApply,
  applyLabel = "Filtruj",
  clearLabel = "Wyczyść filtry",
  showFieldPicker,
  onOpenFieldPicker,
  fieldPickerLabel,
  trailing,
  className,
}: AppFilterPanelProps) {
  const bodyVisible = expanded === undefined || expanded;

  return (
    <FilterPanel className={className ?? `${moduleListFilterPanelBareClass} ${filterEmbeddedPanelClass}`.trim()}>
      <FilterToolbar
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
        onClear={onClear}
        onApply={onApply}
        showApply={false}
        showHeaderActions={false}
        trailing={trailing}
        showFieldPicker={showFieldPicker}
        onOpenFieldPicker={onOpenFieldPicker}
        fieldPickerLabel={fieldPickerLabel}
        expandedToggleLabel="Filtry"
        collapsedToggleLabel="Filtry"
      />
      {bodyVisible ? (
        <FilterPanelBodyWithActions onClear={onClear} onApply={onApply} clearLabel={clearLabel} applyLabel={applyLabel}>
          {children}
        </FilterPanelBodyWithActions>
      ) : null}
    </FilterPanel>
  );
}
