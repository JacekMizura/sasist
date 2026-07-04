import type { ListViewActionsBinding } from "../../preferences/listView/listViewActionsTypes";
import {
  filterActionsFooterClass,
  filterActionsFooterMobileOnlyClass,
} from "./filterUiTokens";
import { FilterApplyActions } from "./FilterApplyActions";

export type FilterActionsBarProps = {
  onClear: () => void;
  onApply: () => void;
  clearLabel?: string;
  applyLabel?: string;
  listView?: ListViewActionsBinding;
  /** When true, hidden from `sm` up (use with FilterToolbar on the same panel). */
  footerMobileOnly?: boolean;
  className?: string;
};

export function FilterActionsBar({
  onClear,
  onApply,
  clearLabel = "Wyczyść filtry",
  applyLabel = "Filtruj",
  listView,
  footerMobileOnly = false,
  className,
}: FilterActionsBarProps) {
  const footerClass =
    className ?? (footerMobileOnly ? filterActionsFooterMobileOnlyClass : filterActionsFooterClass);

  return (
    <FilterApplyActions
      className={footerClass}
      onClear={onClear}
      onApply={onApply}
      clearLabel={clearLabel}
      applyLabel={applyLabel}
      listView={listView}
      applyButtonType="submit"
    />
  );
}
