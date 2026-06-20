import { Link } from "react-router-dom";
import type { RefObject } from "react";
import { Pencil, Trash2 } from "lucide-react";

import type { CustomerListRow } from "../../../api/customersApi";
import { countryLabel } from "../../../constants/countryCodes";
import { customerTypeLabel, salesChannelLabel } from "../../../modules/customers/customerProfile";
import {
  CUSTOMER_LIST_COLUMN_WIDTH,
  customerListColumnLabel,
} from "./customerListColumnCatalog";
import {
  customerListCellOrDash,
  customerListClientLines,
  customerListExtendedColumnText,
} from "./customerListCellPresentation";
import {
  customersListActionsCellClass,
  customersListActionsColWidth,
  customersListActionsInnerClass,
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
  const client = customerListClientLines(row);
  const email = row.email?.trim() ?? "";

  switch (columnId) {
    case "id":
      return (
        <div className={customersListRowInnerClass}>
          <span className="font-mono text-sm font-semibold tabular-nums text-slate-600">{row.id}</span>
        </div>
      );
    case "client":
      return (
        <div className={`${customersListRowInnerClass} min-w-0 flex-col !items-start justify-center gap-0.5 py-2`}>
          <Link
            to={`/customers/${row.id}`}
            className="block max-w-full truncate text-base font-semibold text-slate-900 hover:underline"
            title={client.primary}
          >
            {client.primary}
          </Link>
          {client.secondary ? (
            <p className="max-w-full truncate text-sm text-slate-500" title={client.secondary}>
              {client.secondary}
            </p>
          ) : null}
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
    <div className="overflow-x-auto">
      <table className={customersListTableClass}>
        <colgroup>
          <col className="w-10" />
          {columnOrder.map((colId) => (
            <col key={colId} style={{ width: CUSTOMER_LIST_COLUMN_WIDTH[colId] ?? "auto" }} />
          ))}
          <col style={{ width: customersListActionsColWidth }} />
        </colgroup>
        <thead>
          <tr>
            <th className={customersListThClass}>
              <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center">
                <input
                  ref={headerSelectAllRef}
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                  checked={allPageSelected}
                  disabled={deleteBusy || rows.length === 0}
                  onChange={onToggleAllPage}
                  aria-label="Zaznacz wszystkich klientów na stronie"
                />
              </label>
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
          {rows.map((r) => {
            const client = customerListClientLines(r);
            const isSelected = selected.has(r.id);

            return (
              <tr
                key={r.id}
                className={`${customersListRowClass} ${isSelected ? "bg-sky-50/40 hover:bg-sky-50/50" : ""}`}
              >
                <td className={customersListTdClass}>
                  <div className={customersListRowInnerClass}>
                    <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                        checked={isSelected}
                        disabled={deleteBusy}
                        onChange={() => onToggleOne(r.id)}
                        aria-label={`Zaznacz klienta ${client.primary}`}
                      />
                    </label>
                  </div>
                </td>
                {columnOrder.map((colId) => (
                  <td key={colId} className={customersListTdClass}>
                    <CustomerListDataCell row={r} columnId={colId} />
                  </td>
                ))}
                <td className={customersListActionsCellClass} style={{ width: customersListActionsColWidth }}>
                  <div className={customersListActionsInnerClass}>
                    <Link
                      to={`/customers/${r.id}`}
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
                      onClick={() => onDelete(r.id)}
                    >
                      <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} />
                    </button>
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
