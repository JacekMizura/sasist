import type { RefObject } from "react";
import { Pencil, Trash2 } from "lucide-react";

import type { ManufacturerRead } from "../../../api/manufacturersApi";
import { OperationalActionButton } from "../../operational";
import { useProportionalTableColumns } from "../../listPage/useProportionalTableColumns";
import { ManufacturerLogo } from "./ManufacturerLogo";
import { manufacturerListColumnLabel } from "./manufacturerListColumnCatalog";
import {
  manufacturerListCellOrDash,
  manufacturerNameLines,
} from "./manufacturerListCellPresentation";
import {
  manufacturersListActionsCellClass,
  manufacturersListActionsInnerClass,
  manufacturersListActionsThClass,
  manufacturersListBadgeBaseClass,
  manufacturersListCheckboxCellClass,
  manufacturersListCheckboxInnerClass,
  manufacturersListCheckboxInputClass,
  manufacturersListCheckboxThClass,
  manufacturersListLogoCellClass,
  manufacturersListLogoThClass,
  manufacturersListNameCellClass,
  manufacturersListNameThClass,
  manufacturersListRowClass,
  manufacturersListRowInnerClass,
  manufacturersListTableClass,
  manufacturersListTdClass,
  manufacturersListThClass,
  MANUFACTURERS_LIST_TABLE_LAYOUT,
} from "./manufacturersListTableTokens";

export type ManufacturersListTableProps = {
  rows: ManufacturerRead[];
  columnOrder: string[];
  selected: Set<number>;
  deleteBusy: number | null;
  allPageSelected: boolean;
  headerSelectAllRef: RefObject<HTMLInputElement | null>;
  onToggleOne: (id: number) => void;
  onToggleAllPage: () => void;
  onEdit: (id: number) => void;
  onDelete: (row: ManufacturerRead) => void;
  onProductsClick: (row: ManufacturerRead) => void;
};

function RowCheckbox({
  checked,
  disabled,
  onChange,
  ariaLabel,
  inputRef,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  ariaLabel: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className={manufacturersListCheckboxInnerClass}>
      <input
        ref={inputRef}
        type="checkbox"
        className={manufacturersListCheckboxInputClass}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={ariaLabel}
      />
    </label>
  );
}

function ManufacturerStatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className={`${manufacturersListBadgeBaseClass} border-emerald-200 bg-emerald-50 text-emerald-900`}>
        Aktywny
      </span>
    );
  }
  return (
    <span className={`${manufacturersListBadgeBaseClass} border-slate-200 bg-slate-50 text-slate-600`}>
      Nieaktywny
    </span>
  );
}

function ManufacturerNameCell({ row }: { row: ManufacturerRead }) {
  const nameLines = manufacturerNameLines(row);
  return (
    <div className={`${manufacturersListRowInnerClass} min-w-0 flex-col !items-start gap-0.5 py-2`}>
      <span className="block max-w-full truncate text-sm font-medium text-slate-900" title={nameLines.title}>
        {nameLines.title}
      </span>
      {nameLines.companyLine ? (
        <span className="block max-w-full truncate text-xs leading-snug text-slate-500" title={nameLines.companyLine}>
          {nameLines.companyLine}
        </span>
      ) : null}
      {nameLines.nipLine ? (
        <span className="block max-w-full truncate text-xs leading-snug text-slate-500">{nameLines.nipLine}</span>
      ) : null}
    </div>
  );
}

function ManufacturerDynamicCell({
  row,
  columnId,
  onProductsClick,
}: {
  row: ManufacturerRead;
  columnId: string;
  onProductsClick: (row: ManufacturerRead) => void;
}) {
  switch (columnId) {
    case "country":
      return (
        <div className={`${manufacturersListRowInnerClass} min-w-0 text-slate-700`}>
          <span className="block truncate">{manufacturerListCellOrDash(row.country)}</span>
        </div>
      );
    case "status":
      return (
        <div className={manufacturersListRowInnerClass}>
          <ManufacturerStatusBadge active={row.active} />
        </div>
      );
    case "products":
      return (
        <div className={`${manufacturersListRowInnerClass} tabular-nums`}>
          {row.product_count > 0 ? (
            <button
              type="button"
              onClick={() => onProductsClick(row)}
              className="font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
              title="Otwórz listę produktów z filtrem po tym producencie"
            >
              {row.product_count}
            </button>
          ) : (
            <span className="text-slate-500">0</span>
          )}
        </div>
      );
    case "phone":
      return (
        <div className={`${manufacturersListRowInnerClass} min-w-0 text-slate-700`}>
          <span className="block truncate">{manufacturerListCellOrDash(row.phone)}</span>
        </div>
      );
    case "email":
      return (
        <div className={`${manufacturersListRowInnerClass} min-w-0`}>
          {row.email?.trim() ? (
            <span className="block max-w-full truncate" title={row.email.trim()}>
              {row.email.trim()}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </div>
      );
    case "suppliers":
      return (
        <div className={`${manufacturersListRowInnerClass} tabular-nums text-slate-700`}>
          {row.supplier_count != null && row.supplier_count > 0 ? row.supplier_count : "—"}
        </div>
      );
    case "nip":
      return (
        <div className={`${manufacturersListRowInnerClass} min-w-0 text-slate-700`}>
          <span className="block truncate">{manufacturerListCellOrDash(row.tax_id)}</span>
        </div>
      );
    case "city":
      return (
        <div className={`${manufacturersListRowInnerClass} min-w-0 text-slate-700`}>
          <span className="block truncate">{manufacturerListCellOrDash(row.city)}</span>
        </div>
      );
    default:
      return <div className={manufacturersListRowInnerClass}>—</div>;
  }
}

export function ManufacturersListTable({
  rows,
  columnOrder,
  selected,
  deleteBusy,
  allPageSelected,
  headerSelectAllRef,
  onToggleOne,
  onToggleAllPage,
  onEdit,
  onDelete,
  onProductsClick,
}: ManufacturersListTableProps) {
  const { containerRef, widths, contentMinWidthPx, needsHorizontalScroll } =
    useProportionalTableColumns(columnOrder.length, MANUFACTURERS_LIST_TABLE_LAYOUT);

  return (
    <div
      ref={containerRef}
      className={`w-full min-w-0 ${needsHorizontalScroll ? "overflow-x-auto" : "overflow-x-hidden"}`}
    >
      <table
        className={manufacturersListTableClass}
        style={needsHorizontalScroll ? { width: contentMinWidthPx } : undefined}
      >
        <colgroup>
          <col style={{ width: widths.checkbox }} />
          <col style={{ width: widths.logo }} />
          <col style={{ width: widths.name }} />
          {columnOrder.map((colId) => (
            <col key={colId} style={{ width: widths.dynamic > 0 ? widths.dynamic : undefined }} />
          ))}
          <col style={{ width: widths.actions }} />
        </colgroup>
        <thead>
          <tr>
            <th className={manufacturersListCheckboxThClass}>
              <RowCheckbox
                inputRef={headerSelectAllRef}
                checked={allPageSelected}
                disabled={deleteBusy != null || rows.length === 0}
                onChange={onToggleAllPage}
                ariaLabel="Zaznacz wszystkich producentów na stronie"
              />
            </th>
            <th className={manufacturersListLogoThClass}>Logo</th>
            <th className={manufacturersListNameThClass}>Nazwa</th>
            {columnOrder.map((colId) => (
              <th key={colId} className={manufacturersListThClass}>
                {manufacturerListColumnLabel(colId)}
              </th>
            ))}
            <th className={manufacturersListActionsThClass}>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = selected.has(row.id);
            const busy = deleteBusy === row.id;

            return (
              <tr
                key={row.id}
                className={`${manufacturersListRowClass} ${isSelected ? "bg-sky-50/40 hover:bg-sky-50/50" : ""}`}
              >
                <td className={manufacturersListCheckboxCellClass}>
                  <RowCheckbox
                    checked={isSelected}
                    disabled={busy}
                    onChange={() => onToggleOne(row.id)}
                    ariaLabel={`Zaznacz producenta ${row.name}`}
                  />
                </td>
                <td className={manufacturersListLogoCellClass}>
                  <div className={`${manufacturersListRowInnerClass} justify-center`}>
                    <ManufacturerLogo logoUrl={row.logo_url} />
                  </div>
                </td>
                <td className={manufacturersListNameCellClass}>
                  <ManufacturerNameCell row={row} />
                </td>
                {columnOrder.map((colId) => (
                  <td key={colId} className={manufacturersListTdClass}>
                    <ManufacturerDynamicCell row={row} columnId={colId} onProductsClick={onProductsClick} />
                  </td>
                ))}
                <td className={manufacturersListActionsCellClass}>
                  <div className={manufacturersListActionsInnerClass}>
                    <OperationalActionButton
                      title="Edytuj producenta"
                      aria-label="Edytuj producenta"
                      onClick={() => onEdit(row.id)}
                    >
                      <Pencil strokeWidth={2} aria-hidden />
                    </OperationalActionButton>
                    <OperationalActionButton
                      variant="danger"
                      title={row.product_count > 0 ? "Dezaktywuj producenta" : "Usuń producenta"}
                      aria-label={row.product_count > 0 ? "Dezaktywuj producenta" : "Usuń producenta"}
                      disabled={busy}
                      onClick={() => onDelete(row)}
                    >
                      <Trash2 strokeWidth={2} aria-hidden />
                    </OperationalActionButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
