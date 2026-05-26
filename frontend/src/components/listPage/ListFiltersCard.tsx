import type { ReactNode } from "react";
import { FilterPanel, FilterToolbar, filterToolbarBtnApply, filterToolbarBtnSecondary } from "../filters";
import { moduleListFilterBodyClass, moduleListFilterPanelBareClass } from "./moduleListLayoutTokens";

type ListFiltersCardProps = {
  onApply: () => void;
  onClear: () => void;
  children: ReactNode;
  rightSlot?: ReactNode;
  applyLabel?: string;
  clearLabel?: string;
};

export function ListFiltersCard({
  onApply,
  onClear,
  children,
  rightSlot,
  applyLabel = "Filtruj",
  clearLabel = "Wyczyść",
}: ListFiltersCardProps) {
  return (
    <FilterPanel className={moduleListFilterPanelBareClass}>
      <FilterToolbar
        left={
          <>
            <button type="button" className={filterToolbarBtnApply} onClick={onApply}>
              {applyLabel}
            </button>
            <button type="button" className={filterToolbarBtnSecondary} onClick={onClear}>
              {clearLabel}
            </button>
          </>
        }
        right={rightSlot ?? null}
      />
      <div className={moduleListFilterBodyClass}>{children}</div>
    </FilterPanel>
  );
}
