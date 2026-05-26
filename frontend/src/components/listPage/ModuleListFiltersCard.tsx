import type { ReactNode } from "react";
import { FilterPanel, FilterToolbar } from "../filters";
import { moduleListFilterBodyClass, moduleListFilterPanelBareClass } from "./moduleListLayoutTokens";

type ModuleListFiltersCardProps = {
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onClear: () => void;
  onApply: () => void;
  applyLabel?: string;
  clearLabel?: string;
  showFieldPicker?: boolean;
  onOpenFieldPicker?: () => void;
  /** Override filter body spacing (default adds top border). */
  filterBodyClassName?: string;
  children: ReactNode;
};

export function ModuleListFiltersCard({
  expanded,
  onToggleExpanded,
  onClear,
  onApply,
  applyLabel = "Filtruj",
  clearLabel = "Wyczyść",
  showFieldPicker = false,
  onOpenFieldPicker,
  filterBodyClassName,
  children,
}: ModuleListFiltersCardProps) {
  return (
    <FilterPanel className={moduleListFilterPanelBareClass}>
      <FilterToolbar
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
        onClear={onClear}
        onApply={onApply}
        applyLabel={applyLabel}
        clearLabel={clearLabel}
        showFieldPicker={showFieldPicker}
        onOpenFieldPicker={onOpenFieldPicker}
      />
      {expanded === undefined || expanded ? (
        <div className={filterBodyClassName ?? moduleListFilterBodyClass}>{children}</div>
      ) : null}
    </FilterPanel>
  );
}
