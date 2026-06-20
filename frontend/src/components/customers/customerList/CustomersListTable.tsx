import { Link } from "react-router-dom";
import type { RefObject } from "react";
import { Pencil, Trash2 } from "lucide-react";

import type { CustomerListRow } from "../../../api/customersApi";
import { countryLabel } from "../../../constants/countryCodes";
import { customerTypeLabel, salesChannelLabel } from "../../../modules/customers/customerProfile";
import {
  customerListCellOrDash,
  customerListClientLines,
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
  selected: Set<number>;
  deleteBusy: boolean;
  allPageSelected: boolean;
  somePageSelected: boolean;
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

export function CustomersListTable({
  rows,
  selected,
  deleteBusy,
  allPageSelected,
  somePageSelected,
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
          <col style={{ width: "22%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "8%" }} />
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
            <th className={customersListThClass}>Klient</th>
            <th className={customersListThClass}>Typ</th>
            <th className={customersListThClass}>Kanał</th>
            <th className={customersListThClass}>E-mail</th>
            <th className={customersListThClass}>Telefon</th>
            <th className={customersListThClass}>NIP</th>
            <th className={customersListThClass}>Kraj</th>
            <th className={customersListThClass} style={{ width: customersListActionsColWidth }}>
              Akcje
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const client = customerListClientLines(r);
            const email = r.email?.trim() ?? "";
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
                <td className={customersListTdClass}>
                  <div className={`${customersListRowInnerClass} min-w-0 flex-col !items-start justify-center gap-0.5 py-2`}>
                    <Link
                      to={`/customers/${r.id}`}
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
                </td>
                <td className={customersListTdClass}>
                  <div className={customersListRowInnerClass}>
                    <CustomerTypeBadges row={r} />
                  </div>
                </td>
                <td className={`${customersListTdClass} text-slate-700`}>
                  <div className={customersListRowInnerClass}>{salesChannelLabel(r.sales_channel)}</div>
                </td>
                <td className={`${customersListTdClass} text-slate-700`}>
                  <div className={customersListRowInnerClass}>
                    {email ? (
                      <span className="block max-w-full truncate" title={email}>
                        {email}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                </td>
                <td className={`${customersListTdClass} text-slate-700`}>
                  <div className={customersListRowInnerClass}>{customerListCellOrDash(r.phone)}</div>
                </td>
                <td className={`${customersListTdClass} text-slate-700`}>
                  <div className={customersListRowInnerClass}>{customerListCellOrDash(r.nip)}</div>
                </td>
                <td className={`${customersListTdClass} text-slate-700`}>
                  <div className={customersListRowInnerClass}>{countryLabel(r.country_code)}</div>
                </td>
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
