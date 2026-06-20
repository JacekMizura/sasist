import { Pencil, Printer, Trash2 } from "lucide-react";

import type { DeliveryListRow, DeliveryStatus } from "../../api/inboundDeliveriesApi";
import {
  PROPORTIONAL_TABLE_NO_LOGO,
  PROPORTIONAL_TABLE_SYSTEM_WIDTHS,
} from "../../components/listPage/proportionalTableColumns";
import { useProportionalTableColumns } from "../../components/listPage/useProportionalTableColumns";
import {
  poListActionsCellClass,
  poListActionsInnerClass,
  poListActionsThClass,
  poListNameCellClass,
  poListNameThClass,
  poListRowActionBtn,
  poListRowActionBtnDanger,
  poListRowClass,
  poListRowInnerClass,
  poListTableClass,
  poListTdClass,
  poListThClass,
} from "../../components/purchaseOrders/purchaseOrdersList/purchaseOrdersListTableTokens";
import { supplierScoreTier } from "../../utils/supplierScoreBadge";

const PO_DYNAMIC_COLUMN_COUNT = 9;

const PO_TABLE_LAYOUT = {
  ...PROPORTIONAL_TABLE_SYSTEM_WIDTHS,
  ...PROPORTIONAL_TABLE_NO_LOGO,
  checkboxPx: 0,
};

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  draft: "Szkic",
  ordered: "Zamówione",
  in_transit: "W drodze",
  received: "Dostarczone",
  cancelled: "Anulowane",
};

function statusBadgeClass(s: DeliveryStatus): string {
  switch (s) {
    case "draft":
      return "bg-slate-100 text-slate-800 ring-1 ring-slate-200";
    case "ordered":
      return "bg-sky-100 text-sky-900 ring-1 ring-sky-200";
    case "in_transit":
      return "bg-amber-100 text-amber-950 ring-1 ring-amber-200";
    case "received":
      return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200";
    case "cancelled":
      return "bg-red-50 text-red-800 ring-1 ring-red-100";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function deliveryListLabel(row: DeliveryListRow): string {
  const n = row.name?.trim();
  return n ? n : `#${row.id}`;
}

function canCreatePz(row: DeliveryListRow): boolean {
  return row.item_count > 0 && row.status !== "cancelled" && row.status !== "received";
}

export type PurchaseOrdersListTableProps = {
  rows: DeliveryListRow[];
  scoreBySupplierId: Record<number, number | null>;
  printMenuOpenId: number | null;
  onPrintMenuToggle: (deliveryId: number) => void;
  onEdit: (id: number) => void;
  onDeleteDraft: (id: number) => void;
  onToastCannotDelete: () => void;
  onPz: (id: number) => void;
  onPrintDirect: (id: number) => void;
  onOpenPdf: (id: number) => void;
  formatDt: (iso: string | null | undefined) => string;
  fmtMoney: (n: number) => string;
};

export function PurchaseOrdersListTable({
  rows,
  scoreBySupplierId,
  printMenuOpenId,
  onPrintMenuToggle,
  onEdit,
  onDeleteDraft,
  onToastCannotDelete,
  onPz,
  onPrintDirect,
  onOpenPdf,
  formatDt,
  fmtMoney,
}: PurchaseOrdersListTableProps) {
  const { containerRef, widths, needsHorizontalScroll, contentMinWidthPx } = useProportionalTableColumns(
    PO_DYNAMIC_COLUMN_COUNT,
    PO_TABLE_LAYOUT,
  );

  const scrollClass = needsHorizontalScroll ? "overflow-x-auto" : "overflow-x-hidden";
  const tableWidthStyle = needsHorizontalScroll ? { minWidth: contentMinWidthPx } : undefined;
  const dynamicW = widths.dynamic;

  return (
    <div ref={containerRef} className={`min-w-0 ${scrollClass}`}>
      <table className={poListTableClass} style={tableWidthStyle}>
        <colgroup>
          <col style={{ width: dynamicW }} />
          <col style={{ width: widths.name }} />
          <col style={{ width: dynamicW }} />
          <col style={{ width: dynamicW }} />
          <col style={{ width: dynamicW }} />
          <col style={{ width: dynamicW }} />
          <col style={{ width: dynamicW }} />
          <col style={{ width: dynamicW }} />
          <col style={{ width: dynamicW }} />
          <col style={{ width: dynamicW }} />
          <col style={{ width: widths.actions }} />
        </colgroup>
        <thead>
          <tr>
            <th className={poListThClass}>Numer</th>
            <th className={poListNameThClass}>Nazwa</th>
            <th className={poListThClass}>Dostawca</th>
            <th className={`${poListThClass} text-center`}>Punktacja</th>
            <th className={`${poListThClass} text-center`}>Status</th>
            <th className={poListThClass}>Utworzono</th>
            <th className={poListThClass}>Oczekiwana</th>
            <th className={`${poListThClass} text-right`}>Netto</th>
            <th className={`${poListThClass} text-right`}>Brutto</th>
            <th className={`${poListThClass} text-right`}>Poz.</th>
            <th className={poListActionsThClass}>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const sc = scoreBySupplierId[row.supplier_id];
            const tier = supplierScoreTier(sc);
            const net = row.total_net ?? row.total_value ?? 0;
            const gross = row.total_gross ?? net + (row.total_vat ?? 0);
            return (
              <tr key={row.id} className={poListRowClass}>
                <td className={poListTdClass}>
                  <div className={`${poListRowInnerClass} tabular-nums font-semibold text-slate-800`}>#{row.id}</div>
                </td>
                <td className={poListNameCellClass}>
                  <div className={`${poListRowInnerClass} min-w-0`}>
                    <button
                      type="button"
                      onClick={() => onEdit(row.id)}
                      className="block max-w-full truncate text-left font-medium text-sky-800 hover:underline"
                      title={deliveryListLabel(row)}
                    >
                      {deliveryListLabel(row)}
                    </button>
                  </div>
                </td>
                <td className={poListTdClass}>
                  <div className={`${poListRowInnerClass} min-w-0`}>
                    <span className="block max-w-full truncate" title={row.supplier_name ?? undefined}>
                      {row.supplier_name}
                    </span>
                  </div>
                </td>
                <td className={poListTdClass}>
                  <div className={`${poListRowInnerClass} justify-center`}>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tier.badgeClass}`}
                      title={sc != null ? `Punktacja dostawcy: ${sc}` : "Brak danych punktacji"}
                    >
                      {tier.label}
                    </span>
                  </div>
                </td>
                <td className={poListTdClass}>
                  <div className={`${poListRowInnerClass} justify-center`}>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}
                    >
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </div>
                </td>
                <td className={poListTdClass}>
                  <div className={`${poListRowInnerClass} whitespace-nowrap tabular-nums text-slate-600`}>
                    {formatDt(row.created_at)}
                  </div>
                </td>
                <td className={poListTdClass}>
                  <div className={`${poListRowInnerClass} whitespace-nowrap tabular-nums text-slate-600`}>
                    {formatDt(row.expected_date)}
                  </div>
                </td>
                <td className={poListTdClass}>
                  <div className={`${poListRowInnerClass} justify-end tabular-nums font-medium text-slate-900`}>
                    {fmtMoney(net)}
                  </div>
                </td>
                <td className={poListTdClass}>
                  <div className={`${poListRowInnerClass} justify-end tabular-nums text-slate-800`}>
                    {fmtMoney(gross)}
                  </div>
                </td>
                <td className={poListTdClass}>
                  <div className={`${poListRowInnerClass} justify-end tabular-nums text-slate-800`}>
                    {row.item_count}
                  </div>
                </td>
                <td className={poListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                  <div className={poListActionsInnerClass}>
                    <button
                      type="button"
                      className={poListRowActionBtn}
                      aria-label="Edytuj"
                      title="Edytuj"
                      onClick={() => onEdit(row.id)}
                    >
                      <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </button>
                    <div className="relative flex shrink-0 justify-center" data-print-menu-root>
                      <button
                        type="button"
                        className={poListRowActionBtn}
                        aria-label="Drukuj"
                        title="Drukuj / PDF"
                        onClick={() => onPrintMenuToggle(row.id)}
                      >
                        <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </button>
                      {printMenuOpenId === row.id ? (
                        <div className="absolute right-0 top-full z-[320] mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                            onClick={() => onPrintDirect(row.id)}
                          >
                            Drukuj
                          </button>
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                            onClick={() => onOpenPdf(row.id)}
                          >
                            Pobierz PDF
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {canCreatePz(row) ? (
                      <button
                        type="button"
                        className={poListRowActionBtn}
                        title="Przyjęcie dostawy (dokument magazynowy)"
                        onClick={() => onPz(row.id)}
                      >
                        <span className="text-xs font-semibold leading-none tabular-nums">PZ</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={poListRowActionBtnDanger}
                      aria-label="Usuń"
                      title={row.status === "draft" ? "Usuń" : "Tylko szkic"}
                      disabled={row.status !== "draft"}
                      onClick={() => {
                        if (row.status !== "draft") {
                          onToastCannotDelete();
                          return;
                        }
                        onDeleteDraft(row.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
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
