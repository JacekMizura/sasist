import type { RefObject } from "react";
import { Pencil, ShoppingBag, Trash2 } from "lucide-react";

import type { SupplierRead } from "../../../api/inboundSuppliersApi";
import { PROPORTIONAL_TABLE_NO_LOGO } from "../../listPage/proportionalTableColumns";
import { useProportionalTableColumns } from "../../listPage/useProportionalTableColumns";
import { supplierListColumnLabel } from "./supplierListColumnCatalog";
import { supplierListCellOrDash, supplierNameLines } from "./supplierListCellPresentation";
import {
  suppliersListActionsCellClass,
  suppliersListActionsInnerClass,
  suppliersListActionsThClass,
  suppliersListCheckboxCellClass,
  suppliersListCheckboxInnerClass,
  suppliersListCheckboxInputClass,
  suppliersListCheckboxThClass,
  suppliersListNameCellClass,
  suppliersListNameThClass,
  suppliersListRowActionBtn,
  suppliersListRowActionBtnAccent,
  suppliersListRowActionBtnDanger,
  suppliersListRowClass,
  suppliersListRowInnerClass,
  suppliersListTableClass,
  suppliersListTdClass,
  suppliersListThClass,
} from "./suppliersListTableTokens";

export type SuppliersListTableProps = {
  rows: SupplierRead[];
  columnOrder: string[];
  selected: Set<number>;
  deleteBusy: number | null;
  newOrderBusyId: number | null;
  allPageSelected: boolean;
  headerSelectAllRef: RefObject<HTMLInputElement | null>;
  onToggleOne: (id: number) => void;
  onToggleAllPage: () => void;
  onEdit: (id: number) => void;
  onDelete: (row: SupplierRead) => void;
  onNewOrder: (id: number) => void;
  onProductsClick: (row: SupplierRead) => void;
  onOrdersClick: (row: SupplierRead) => void;
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
    <label className={suppliersListCheckboxInnerClass}>
      <input
        ref={inputRef}
        type="checkbox"
        className={suppliersListCheckboxInputClass}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={ariaLabel}
      />
    </label>
  );
}

function SupplierStatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200">
        Aktywny
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
      Nieaktywny
    </span>
  );
}

function SupplierNameCell({ row }: { row: SupplierRead }) {
  const lines = supplierNameLines(row);
  return (
    <div className={`${suppliersListRowInnerClass} min-w-0 flex-col !items-start gap-0.5 py-2`}>
      <span className="block max-w-full truncate text-base font-semibold text-slate-900" title={lines.title}>
        {lines.title}
      </span>
      {lines.companyLine ? (
        <span className="block max-w-full truncate text-xs leading-snug text-slate-500" title={lines.companyLine}>
          {lines.companyLine}
        </span>
      ) : null}
      {lines.nipLine ? (
        <span className="block max-w-full truncate text-xs leading-snug text-slate-500">{lines.nipLine}</span>
      ) : null}
    </div>
  );
}

function SupplierShippingCell({ row }: { row: SupplierRead }) {
  const cur = (row.default_currency ?? "").trim() || "PLN";
  return (
    <div className={`${suppliersListRowInnerClass} min-w-0 flex-col !items-start gap-1 py-2`}>
      {row.offers_free_shipping === false ? (
        <span className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
          Tylko płatna
        </span>
      ) : (
        <span className="inline-flex w-fit rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-950 ring-1 ring-sky-200">
          Darmowa możliwa
        </span>
      )}
      {row.offers_free_shipping !== false && row.free_shipping_threshold != null ? (
        <span className="text-xs tabular-nums text-slate-500">
          od {row.free_shipping_threshold.toFixed(2)} {cur}
        </span>
      ) : null}
    </div>
  );
}

function SupplierMoqCell({ row }: { row: SupplierRead }) {
  const cur = (row.default_currency ?? "").trim() || "PLN";
  return (
    <div className={`${suppliersListRowInnerClass} min-w-0 flex-col !items-start gap-1 py-2`}>
      {row.requires_moq === false ? (
        <span className="inline-flex w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200">
          Bez MOQ
        </span>
      ) : (
        <span className="inline-flex w-fit rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950 ring-1 ring-amber-200">
          MOQ wymagane
        </span>
      )}
      {row.requires_moq !== false ? (
        <span className="text-xs text-slate-500">
          {[
            row.minimum_order_qty != null ? `${row.minimum_order_qty} szt.` : null,
            row.minimum_order_value != null ? `min. ${row.minimum_order_value.toFixed(2)} ${cur}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        </span>
      ) : null}
    </div>
  );
}

function SupplierDynamicCell({
  row,
  columnId,
  onProductsClick,
  onOrdersClick,
}: {
  row: SupplierRead;
  columnId: string;
  onProductsClick: (row: SupplierRead) => void;
  onOrdersClick: (row: SupplierRead) => void;
}) {
  switch (columnId) {
    case "country":
      return (
        <div className={`${suppliersListRowInnerClass} min-w-0 text-slate-700`}>
          <span className="block truncate">{supplierListCellOrDash(row.country)}</span>
        </div>
      );
    case "city":
      return (
        <div className={`${suppliersListRowInnerClass} min-w-0 text-slate-700`}>
          <span className="block truncate">{supplierListCellOrDash(row.city)}</span>
        </div>
      );
    case "email":
      return (
        <div className={`${suppliersListRowInnerClass} min-w-0`}>
          {row.email?.trim() ? (
            <span className="block truncate" title={row.email.trim()}>
              {row.email.trim()}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </div>
      );
    case "phone":
      return (
        <div className={`${suppliersListRowInnerClass} min-w-0 text-slate-700`}>
          <span className="block truncate">{supplierListCellOrDash(row.phone)}</span>
        </div>
      );
    case "currency":
      return (
        <div className={`${suppliersListRowInnerClass} text-slate-700`}>
          {supplierListCellOrDash(row.default_currency)}
        </div>
      );
    case "shipping":
      return <SupplierShippingCell row={row} />;
    case "moq":
      return <SupplierMoqCell row={row} />;
    case "products":
      return (
        <div className={`${suppliersListRowInnerClass} tabular-nums`}>
          {(row.product_count ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => onProductsClick(row)}
              className="font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
            >
              {row.product_count}
            </button>
          ) : (
            <span className="text-slate-500">0</span>
          )}
        </div>
      );
    case "orders":
      return (
        <div className={`${suppliersListRowInnerClass} tabular-nums`}>
          {row.delivery_count > 0 ? (
            <button
              type="button"
              onClick={() => onOrdersClick(row)}
              className="font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
            >
              {row.delivery_count}
            </button>
          ) : (
            <span className="text-slate-500">0</span>
          )}
        </div>
      );
    case "status":
      return (
        <div className={suppliersListRowInnerClass}>
          <SupplierStatusBadge active={row.active} />
        </div>
      );
    default:
      return <div className={suppliersListRowInnerClass}>—</div>;
  }
}

export function SuppliersListTable({
  rows,
  columnOrder,
  selected,
  deleteBusy,
  newOrderBusyId,
  allPageSelected,
  headerSelectAllRef,
  onToggleOne,
  onToggleAllPage,
  onEdit,
  onDelete,
  onNewOrder,
  onProductsClick,
  onOrdersClick,
}: SuppliersListTableProps) {
  const { containerRef, widths, contentMinWidthPx, needsHorizontalScroll } = useProportionalTableColumns(
    columnOrder.length,
    PROPORTIONAL_TABLE_NO_LOGO,
  );

  return (
    <div
      ref={containerRef}
      className={`w-full min-w-0 ${needsHorizontalScroll ? "overflow-x-auto" : "overflow-x-hidden"}`}
    >
      <table
        className={suppliersListTableClass}
        style={needsHorizontalScroll ? { width: contentMinWidthPx } : undefined}
      >
        <colgroup>
          <col style={{ width: widths.checkbox }} />
          <col style={{ width: widths.name }} />
          {columnOrder.map((colId) => (
            <col key={colId} style={{ width: widths.dynamic > 0 ? widths.dynamic : undefined }} />
          ))}
          <col style={{ width: widths.actions }} />
        </colgroup>
        <thead>
          <tr>
            <th className={suppliersListCheckboxThClass}>
              <RowCheckbox
                inputRef={headerSelectAllRef}
                checked={allPageSelected}
                disabled={deleteBusy != null || rows.length === 0}
                onChange={onToggleAllPage}
                ariaLabel="Zaznacz wszystkich dostawców na stronie"
              />
            </th>
            <th className={suppliersListNameThClass}>Nazwa</th>
            {columnOrder.map((colId) => (
              <th key={colId} className={suppliersListThClass}>
                {supplierListColumnLabel(colId)}
              </th>
            ))}
            <th className={suppliersListActionsThClass}>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = selected.has(row.id);
            const busy = deleteBusy === row.id;

            return (
              <tr
                key={row.id}
                className={`${suppliersListRowClass} ${isSelected ? "bg-sky-50/40 hover:bg-sky-50/50" : ""}`}
              >
                <td className={suppliersListCheckboxCellClass}>
                  <RowCheckbox
                    checked={isSelected}
                    disabled={busy}
                    onChange={() => onToggleOne(row.id)}
                    ariaLabel={`Zaznacz dostawcę ${row.name}`}
                  />
                </td>
                <td className={suppliersListNameCellClass}>
                  <SupplierNameCell row={row} />
                </td>
                {columnOrder.map((colId) => (
                  <td key={colId} className={suppliersListTdClass}>
                    <SupplierDynamicCell
                      row={row}
                      columnId={colId}
                      onProductsClick={onProductsClick}
                      onOrdersClick={onOrdersClick}
                    />
                  </td>
                ))}
                <td className={suppliersListActionsCellClass}>
                  <div className={suppliersListActionsInnerClass}>
                    <button
                      type="button"
                      className={suppliersListRowActionBtnAccent}
                      title="Nowe zamówienie"
                      aria-label="Nowe zamówienie"
                      disabled={newOrderBusyId === row.id}
                      onClick={() => onNewOrder(row.id)}
                    >
                      <ShoppingBag className="h-4 w-4 shrink-0" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className={suppliersListRowActionBtn}
                      title="Edytuj"
                      aria-label="Edytuj"
                      onClick={() => onEdit(row.id)}
                    >
                      <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className={suppliersListRowActionBtnDanger}
                      title="Usuń / dezaktywuj"
                      aria-label="Usuń"
                      disabled={busy}
                      onClick={() => onDelete(row)}
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
