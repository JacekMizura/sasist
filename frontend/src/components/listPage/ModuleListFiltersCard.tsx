import type { ReactNode } from "react";

import { AppFilterPanel } from "../app-shell";

type ModuleListFiltersCardProps = {
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onClear: () => void;
  onApply: () => void;
  applyLabel?: string;
  clearLabel?: string;
  showFieldPicker?: boolean;
  onOpenFieldPicker?: () => void;
  filterBodyClassName?: string;
  children: ReactNode;
};

/** Assortment list filters — delegates to {@link AppFilterPanel}. */
export function ModuleListFiltersCard({
  expanded,
  onToggleExpanded,
  onClear,
  onApply,
  applyLabel = "Filtruj",
  clearLabel = "Wyczyść filtry",
  showFieldPicker = false,
  onOpenFieldPicker,
  children,
}: ModuleListFiltersCardProps) {
  return (
    <AppFilterPanel
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      onClear={onClear}
      onApply={onApply}
      applyLabel={applyLabel}
      clearLabel={clearLabel}
      showFieldPicker={showFieldPicker}
      onOpenFieldPicker={onOpenFieldPicker}
    >
      {children}
    </AppFilterPanel>
  );
}
