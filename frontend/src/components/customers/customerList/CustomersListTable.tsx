import { Link } from "react-router-dom";
import { memo, type RefObject } from "react";
import { Pencil, Trash2 } from "lucide-react";

import type { CustomerListRow } from "../../../api/customersApi";
import { countryLabel } from "../../../constants/countryCodes";
import { customerTypeLabel, salesChannelLabel } from "../../../modules/customers/customerProfile";
import {
  CUSTOMER_LIST_COLUMN_WIDTH,
  customerListColumnLabel,
} from "./customerListColumnCatalog";
import {
  CUSTOMER_LIST_MISSING_NAME,
  customerListCellOrDash,
  customerListClientName,
  customerListExtendedColumnText,
} from "./customerListCellPresentation";
import {
  customersListActionsCellClass,
  customersListActionsColWidth,
  customersListActionsInnerClass,
  customersListCheckboxCellClass,
  customersListCheckboxColWidth,
  customersListCheckboxInnerClass,
  customersListCheckboxInputClass,
  customersListCheckboxThClass,
  customersListRowActionBtn,
  customersListRowActionBtnDanger,
  customersListRowClass,
  customersListRowInnerClass,
  customersListTableClass,
  customersListTdClass,
  customersListThClass,
} from "./customersListTableTokens";

export type CustomersListTableProps = {
  rows: CustomerListRow[];
  columnOrder: string[];
  selected: Set<number>;
  deleteBusy: boolean;
  allPageSelected: boolean;
  headerSelectAllRef: RefObject<HTMLInputElement | null>;
  onToggleOne: (id: number) => void;
  onToggleAllPage: () => void;
  onDelete: (id: number) => void;
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
    <label className={customersListCheckboxInnerClass}>
      <input
        ref={inputRef}
        type="checkbox"
        className={customersListCheckboxInputClass}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={ariaLabel}
      />
    </label>
  );
}

function CustomerTypeBadges({ row }: { row: CustomerListRow }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
        {customerTypeLabel(row.customer_type)}
      </span>
      {row.flags?.vip ? (
        <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
          VIP
        </span>
      ) : null}
      {row.flags?.marketplace ? (
        <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-900">
          MP
        </span>
      ) : null}
      {row.customer_status === "blocked" ? (
        <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-800">
          Blokada
        </span>
      ) : null}
    </div>
  );
}

function CustomerListDataCell({
  row,
  columnId,
}: {
  row: CustomerListRow;
  columnId: string;
}) {
  const clientName = customerListClientName(row);
  const email = row.email?.trim() ?? "";
  const missingName = clientName === CUSTOMER_LIST_MISSING_NAME;

  switch (columnId) {
    case "id":
      return (
        <div className={customersListRowInnerClass}>
          <span className="font-mono text-sm font-semibold tabular-nums text-slate-600">{row.id}</span>
        </div>
      );
    case "client":
      return (
        <div className={`${customersListRowInnerClass} min-w-0`}>
          {missingName ? (
            <span className="block max-w-full truncate text-base font-semibold text-slate-400">{clientName}</span>
          ) : (
            <Link
              to={`/customers/${row.id}`}
              className="block max-w-full truncate text-base font-semibold text-slate-900 hover:underline"
              title={clientName}
            >
              {clientName}
            </Link>
          )}
        </div>
      );
    case "customer_type":
      return (
        <div className={customersListRowInnerClass}>
          <CustomerTypeBadges row={row} />
        </div>
      );
    case "sales_channel":
      return (
        <div className={`${customersListRowInnerClass} text-slate-700`}>
          {salesChannelLabel(row.sales_channel)}
        </div>
      );
    case "email":
      return (
        <div className={customersListRowInnerClass}>
          {email ? (
            <span className="block max-w-full truncate" title={email}>
              {email}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </div>
      );
    case "phone":
      return (
        <div className={`${customersListRowInnerClass} text-slate-700`}>
          {customerListCellOrDash(row.phone)}
        </div>
      );
    case "nip":
      return (
        <div className={`${customersListRowInnerClass} text-slate-700`}>
          {customerListCellOrDash(row.nip)}
        </div>
      );
    case "country":
      return (
        <div className={`${customersListRowInnerClass} text-slate-700`}>
          {countryLabel(row.country_code)}
        </div>
      );
    default:
      return (
        <div className={`${customersListRowInnerClass} tabular-nums text-slate-700`}>
          {customerListExtendedColumnText(row, columnId)}
        </div>
      );
  }
}

function MobileCustomerRow({
  row,
  selected,
  deleteBusy,
  onToggleOne,
  onDelete,
}: {
  row: CustomerListRow;
  selected: boolean;
  deleteBusy: boolean;
  onToggleOne: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const clientName = customerListClientName(row);
  const missingName = clientName === CUSTOMER_LIST_MISSING_NAME;

  return (
    <article
      className={`flex items-center gap-0 border-b border-slate-100 px-2 py-0 last:border-b-0 ${
        selected ? "bg-sky-50/40" : "even:bg-slate-50/20"
      }`}
    >
      <div className={customersListCheckboxCellClass}>
        <RowCheckbox
          checked={selected}
          disabled={deleteBusy}
          onChange={() => onToggleOne(row.id)}
          ariaLabel={`Zaznacz klienta ${clientName}`}
        />
      </div>
      <div className="min-h-[3.5rem] min-w-0 flex-1 py-3">
        {missingName ? (
          <span className="block truncate text-base font-semibold text-slate-400">{clientName}</span>
        ) : (
          <Link
            to={`/customers/${row.id}`}
            className="block truncate text-base font-semibold text-slate-900 hover:underline"
            title={clientName}
          >
            {clientName}
          </Link>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 pr-2">
        <Link
          to={`/customers/${row.id}`}
          className={customersListRowActionBtn}
          title="Edytuj"
          aria-label="Edytuj"
        >
          <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} />
        </Link>
        <button
          type="button"
          className={customersListRowActionBtnDanger}
          title="Usuń"
          aria-label="Usuń"
          disabled={deleteBusy}
          onClick={() => onDelete(row.id)}
        >
          <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} />
        </button>
      </div>
    </article>
  );
}

const MemoMobileCustomerRow = memo(MobileCustomerRow);

type CustomerTableRowProps = {
  row: CustomerListRow;
  columnOrder: string[];
  isSelected: boolean;
  deleteBusy: boolean;
  onToggleOne: (id: number) => void;
  onDelete: (id: number) => void;
};

const CustomerTableRow = memo(function CustomerTableRow({
  row,
  columnOrder,
  isSelected,
  deleteBusy,
  onToggleOne,
  onDelete,
}: CustomerTableRowProps) {
  const clientName = customerListClientName(row);

  return (
    <tr
      className={`${customersListRowClass} ${isSelected ? "bg-sky-50/40 hover:bg-sky-50/50" : ""}`}
    >
      <td className={customersListCheckboxCellClass}>
        <RowCheckbox
          checked={isSelected}
          disabled={deleteBusy}
          onChange={() => onToggleOne(row.id)}
          ariaLabel={`Zaznacz klienta ${clientName}`}
        />
      </td>
      {columnOrder.map((colId) => (
        <td key={colId} className={customersListTdClass}>
          <CustomerListDataCell row={row} columnId={colId} />
        </td>
      ))}
      <td className={customersListActionsCellClass} style={{ width: customersListActionsColWidth }}>
        <div className={customersListActionsInnerClass}>
          <Link
            to={`/customers/${row.id}`}
            className={customersListRowActionBtn}
            title="Edytuj"
            aria-label="Edytuj"
          >
            <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} />
          </Link>
          <button
            type="button"
            className={customersListRowActionBtnDanger}
            title="Usuń"
            aria-label="Usuń"
            disabled={deleteBusy}
            onClick={() => onDelete(row.id)}
          >
            <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} />
          </button>
        </div>
      </td>
    </tr>
  );
});

export function CustomersListTable({
  rows,
  columnOrder,
  selected,
  deleteBusy,
  allPageSelected,
  headerSelectAllRef,
  onToggleOne,
  onToggleAllPage,
  onDelete,
}: CustomersListTableProps) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className={customersListTableClass}>
          <colgroup>
            <col style={{ width: customersListCheckboxColWidth }} />
            {columnOrder.map((colId) => (
              <col key={colId} style={{ width: CUSTOMER_LIST_COLUMN_WIDTH[colId] ?? "auto" }} />
            ))}
            <col style={{ width: customersListActionsColWidth }} />
          </colgroup>
          <thead>
            <tr>
              <th className={customersListCheckboxThClass}>
                <RowCheckbox
                  inputRef={headerSelectAllRef}
                  checked={allPageSelected}
                  disabled={deleteBusy || rows.length === 0}
                  onChange={onToggleAllPage}
                  ariaLabel="Zaznacz wszystkich klientów na stronie"
                />
              </th>
              {columnOrder.map((colId) => (
                <th key={colId} className={customersListThClass}>
                  {customerListColumnLabel(colId)}
                </th>
              ))}
              <th className={customersListThClass} style={{ width: customersListActionsColWidth }}>
                Akcje
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <CustomerTableRow
                key={r.id}
                row={r}
                columnOrder={columnOrder}
                isSelected={selected.has(r.id)}
                deleteBusy={deleteBusy}
                onToggleOne={onToggleOne}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden">
        {rows.map((r) => (
          <MemoMobileCustomerRow
            key={r.id}
            row={r}
            selected={selected.has(r.id)}
            deleteBusy={deleteBusy}
            onToggleOne={onToggleOne}
            onDelete={onDelete}
          />
        ))}
      </div>
    </>
  );
}
