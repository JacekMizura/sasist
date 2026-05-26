import {
  filterActionsFooterClass,
  filterActionsFooterMobileOnlyClass,
  filterToolbarBtnApply,
  filterToolbarBtnSecondary,
} from "./filterUiTokens";

export type FilterActionsBarProps = {
  onClear: () => void;
  onApply: () => void;
  clearLabel?: string;
  applyLabel?: string;
  /** When true, hidden from `sm` up (use with FilterToolbar on the same panel). */
  footerMobileOnly?: boolean;
  className?: string;
};

export function FilterActionsBar({
  onClear,
  onApply,
  clearLabel = "Wyczyść",
  applyLabel = "Zastosuj",
  footerMobileOnly = false,
  className,
}: FilterActionsBarProps) {
  const footerClass =
    className ?? (footerMobileOnly ? filterActionsFooterMobileOnlyClass : filterActionsFooterClass);

  return (
    <div className={footerClass}>
      <button type="button" onClick={onClear} className={filterToolbarBtnSecondary}>
        {clearLabel}
      </button>
      <button type="button" onClick={onApply} className={filterToolbarBtnApply}>
        {applyLabel}
      </button>
    </div>
  );
}
