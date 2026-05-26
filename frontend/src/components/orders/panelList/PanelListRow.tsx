import type { ChangeEvent, MouseEvent, ReactNode } from "react";

import { PanelListRowGrid, PANEL_LIST_ROW_ACTIONS_GRID_CLASS } from "./PanelListRowGrid";
import { PanelListProductLines, type PanelListProductLine } from "./PanelListProductLines";

export type { PanelListProductLine } from "./PanelListProductLines";

export type PanelListRowProps = {
  showCheckbox?: boolean;
  checked?: boolean;
  onToggleCheck?: (e: ChangeEvent<HTMLInputElement>) => void;
  checkboxDisabled?: boolean;
  checkboxAriaLabel?: string;
  dateLine: string;
  primaryLabel: string;
  onPrimaryClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  statusText: string;
  statusChipClassName: string;
  /** Ukryj chip statusu systemowego (np. „Nowe” po 24 h — lista). */
  hideStatusChip?: boolean;
  /** Optional badge after the status chip (e.g. WMS „Braki”). */
  shortageBadge?: ReactNode;
  /** Select statusu panelu na wierszu — opcjonalny (biuro: tylko na szczegółach / bulk). */
  panelSelectDomId?: string;
  panelSelect?: ReactNode | null;
  products: PanelListProductLine[];
  /** Pełna lista aktywnych linii (tooltip przy „+N poz.”). */
  tooltipProducts?: PanelListProductLine[];
  moreCount: number;
  positionCount?: number;
  totalItems?: number;
  customerName: string;
  channelColumn: ReactNode;
  amountText: string;
  amountMeta?: ReactNode;
  /** Ikony akcji — po checkboxie, siatka 2×2 jak zamówienia. */
  rowActions?: ReactNode;
  onRowActivate: () => void;
  rowHighlighted?: boolean;
};

export function PanelListRow({
  showCheckbox = false,
  checked = false,
  onToggleCheck,
  checkboxDisabled,
  checkboxAriaLabel,
  dateLine,
  primaryLabel,
  onPrimaryClick,
  statusText,
  statusChipClassName,
  hideStatusChip = false,
  shortageBadge,
  panelSelectDomId,
  panelSelect,
  products,
  tooltipProducts,
  moreCount,
  positionCount,
  totalItems,
  customerName,
  channelColumn,
  amountText,
  amountMeta,
  rowActions,
  onRowActivate,
  rowHighlighted = false,
}: PanelListRowProps) {
  const leadSlot = (
    <>
      <span className="text-[11px] font-medium tabular-nums text-slate-500">{dateLine}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPrimaryClick?.(e);
          if (!onPrimaryClick) onRowActivate();
        }}
        className="w-fit text-left text-base font-extrabold tracking-tight text-blue-800 hover:text-blue-950 hover:underline"
      >
        {primaryLabel}
      </button>
      {panelSelect != null && panelSelectDomId ? (
        <>
          <label className="sr-only" htmlFor={panelSelectDomId}>
            Status panelu
          </label>
          <div className="mt-0.5 w-full max-w-[12rem]">{panelSelect}</div>
        </>
      ) : null}
    </>
  );

  const tailSlot = (
    <div className="flex min-w-0 flex-col items-end gap-2">
      {!hideStatusChip ? (
        <span
          className={`inline-flex w-fit max-w-full rounded-full px-2 py-0.5 text-[11px] font-bold leading-tight ${statusChipClassName}`}
        >
          {statusText}
        </span>
      ) : null}
      {shortageBadge ? <div className="flex flex-wrap justify-end">{shortageBadge}</div> : null}
      <div className="flex flex-wrap items-end justify-end gap-3 lg:flex-col lg:items-end lg:gap-2">
        <div className="text-xl font-bold tabular-nums leading-none tracking-tight text-slate-900">{amountText}</div>
        {amountMeta}
      </div>
    </div>
  );

  const actionsSlot =
    rowActions != null ? <div className={PANEL_LIST_ROW_ACTIONS_GRID_CLASS}>{rowActions}</div> : undefined;

  return (
    <PanelListRowGrid
      showCheckbox={showCheckbox}
      checked={checked}
      onToggleCheck={onToggleCheck}
      checkboxDisabled={checkboxDisabled}
      checkboxAriaLabel={checkboxAriaLabel}
      actionsSlot={actionsSlot}
      leadSlot={leadSlot}
      productsSlot={
        <PanelListProductLines
          products={products}
          tooltipProducts={tooltipProducts}
          moreCount={moreCount}
          positionCount={positionCount}
          totalItems={totalItems}
        />
      }
      column3={
        <span className="truncate text-sm font-semibold text-slate-900" title={customerName}>
          {customerName}
        </span>
      }
      column4={channelColumn}
      tailSlot={tailSlot}
      onRowActivate={onRowActivate}
      rowHighlighted={rowHighlighted}
    />
  );
}
