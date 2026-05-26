import type { ReactNode } from "react";

import { FilterActionsBar } from "./FilterActionsBar";
import { filterPanelBodyClass } from "./filterUiTokens";

export type FilterPanelBodyWithActionsProps = {
  children: ReactNode;
  onClear: () => void;
  onApply: () => void;
  clearLabel?: string;
  applyLabel?: string;
  /** When true, footer is mobile-only (pair with FilterToolbar on desktop). */
  footerMobileOnly?: boolean;
  className?: string;
};

export function FilterPanelBodyWithActions({
  children,
  onClear,
  onApply,
  clearLabel = "Wyczyść filtry",
  applyLabel = "Filtruj",
  footerMobileOnly = false,
  className,
}: FilterPanelBodyWithActionsProps) {
  return (
    <div className={className ?? filterPanelBodyClass}>
      {children}
      <FilterActionsBar
        onClear={onClear}
        onApply={onApply}
        clearLabel={clearLabel}
        applyLabel={applyLabel}
        footerMobileOnly={footerMobileOnly}
      />
    </div>
  );
}
