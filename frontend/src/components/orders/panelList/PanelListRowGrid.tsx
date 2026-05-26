import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";

/** Same five-column shell as Zamówienia / Zwroty — slots carry domain-specific content. */
/** Col 1: checkbox + akcje (jak zamówienia) + lead; col 4 dla logo kanału / wyśrodkowania. */
export const PANEL_LIST_ROW_GRID_CLASS =
  "grid cursor-pointer grid-cols-1 gap-x-5 gap-y-4 px-4 py-5 transition-colors hover:bg-slate-50/90 sm:px-5 lg:grid-cols-[minmax(14rem,22rem)_minmax(0,1fr)_minmax(7rem,10rem)_minmax(8rem,12rem)_minmax(7rem,12rem)] lg:items-center";

const TAIL_WRAP =
  "flex flex-col gap-2 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0";

/** Jak lista zamówień: komórka akcji 2×2 ikony. */
export const PANEL_LIST_ROW_ACTIONS_GRID_CLASS =
  "grid w-fit grid-cols-2 gap-x-1 gap-y-1 justify-items-center self-start [grid-auto-rows:minmax(2rem,auto)]";

export type PanelListRowGridProps = {
  showCheckbox?: boolean;
  checked?: boolean;
  onToggleCheck?: (e: ChangeEvent<HTMLInputElement>) => void;
  checkboxDisabled?: boolean;
  checkboxAriaLabel?: string;
  /**
   * Ikony akcji między checkboxem a treścią lead — jak kolumna „Akcje” na liście zamówień (`grid-cols-2`).
   */
  actionsSlot?: ReactNode;
  /** Pierwsza kolumna danych: data, ID, pole statusu panelu (bez chipów przeniesionych do tail). */
  leadSlot: ReactNode;
  productsSlot: ReactNode;
  column3: ReactNode;
  column4: ReactNode;
  /** Prawa kolumna: wartość + chipy statusu (bez przycisków akcji). */
  tailSlot: ReactNode;
  onRowActivate: () => void;
  rowHighlighted?: boolean;
};

export function PanelListRowGrid({
  showCheckbox = false,
  checked = false,
  onToggleCheck,
  checkboxDisabled = false,
  checkboxAriaLabel,
  actionsSlot,
  leadSlot,
  productsSlot,
  column3,
  column4,
  tailSlot,
  onRowActivate,
  rowHighlighted = false,
}: PanelListRowGridProps) {
  const onRowKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowActivate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onRowActivate}
      onKeyDown={onRowKeyDown}
      className={`${PANEL_LIST_ROW_GRID_CLASS} ${rowHighlighted ? "bg-blue-50/60" : ""}`}
    >
      <div className="flex min-w-0 gap-2 sm:gap-3">
        {showCheckbox ? (
          <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={checked}
              disabled={checkboxDisabled}
              onChange={(e) => {
                e.stopPropagation();
                onToggleCheck?.(e);
              }}
              className="mt-0.5 rounded border-slate-300 disabled:opacity-50"
              aria-label={checkboxAriaLabel}
            />
          </div>
        ) : (
          <div className="w-4 shrink-0 pt-0.5" aria-hidden />
        )}
        {actionsSlot ? (
          <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()} role="presentation">
            {actionsSlot}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">{leadSlot}</div>
      </div>

      <div className="min-w-0">{productsSlot}</div>

      <div className="flex min-w-0 flex-col justify-center gap-1">{column3}</div>

      <div className="flex h-full items-center justify-start lg:justify-center">{column4}</div>

      <div className={TAIL_WRAP} onClick={(e) => e.stopPropagation()} role="presentation">
        {tailSlot}
      </div>
    </div>
  );
}
