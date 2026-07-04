import type { FormEvent, ReactNode } from "react";

import type { ListViewActionsBinding } from "../../preferences/listView/listViewActionsTypes";
import { FilterActionsBar } from "./FilterActionsBar";
import { filterPanelBodyClass } from "./filterUiTokens";

export type FilterPanelBodyWithActionsProps = {
  children: ReactNode;
  onClear: () => void;
  onApply: () => void;
  clearLabel?: string;
  applyLabel?: string;
  listView?: ListViewActionsBinding;
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
  listView,
  footerMobileOnly = false,
  className,
}: FilterPanelBodyWithActionsProps) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onApply();
  };

  return (
    <form className={className ?? filterPanelBodyClass} onSubmit={handleSubmit} noValidate>
      {children}
      <FilterActionsBar
        onClear={onClear}
        onApply={onApply}
        clearLabel={clearLabel}
        applyLabel={applyLabel}
        listView={listView}
        footerMobileOnly={footerMobileOnly}
      />
    </form>
  );
}
