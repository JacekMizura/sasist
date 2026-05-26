import { Pencil, Printer, Trash2 } from "lucide-react";

import type { DeliveryListRow, DeliveryStatus } from "../../api/inboundDeliveriesApi";
import {
  OperationalActionButton,
  OperationalActionColumn,
  operationalActionsColumnWidthClass,
  panelListDenseRowClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseTheadClass,
} from "../../components/operational";
import { supplierScoreTier } from "../../utils/supplierScoreBadge";

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

/** Stable layout for Zamówienia towaru — table-fixed + explicit cols (no `w-max` drift). */
const PO_TABLE_CLASS =
  "table-fixed w-full min-w-[1080px] border-collapse border-t border-slate-200 text-left";

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
  const th = panelListDenseThBase;

  return (
    <div className={panelListDenseTableScrollWrapClass}>
      <table className={PO_TABLE_CLASS}>
        <colgroup>
          <col style={{ width: "6rem", minWidth: "6rem", maxWidth: "6rem" }} />
          <col style={{ width: 90 }} />
          <col />
          <col />
          <col style={{ width: 110 }} />
          <col style={{ width: 140 }} />
          <col style={{ width: 152 }} />
          <col style={{ width: 152 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 70 }} />
        </colgroup>
        <thead className={panelListDenseTheadClass}>
          <tr>
            <th className={`${th} ${operationalActionsColumnWidthClass} px-1 text-center`}>Akcje</th>
            <th className={`${th} w-[90px] text-left`}>Numer</th>
            <th className={`${th} text-left`}>Nazwa</th>
            <th className={`${th} text-left`}>Dostawca</th>
            <th className={`${th} w-[110px] text-center`}>Scoring</th>
            <th className={`${th} w-[140px] text-center`}>Status</th>
            <th className={`${th} whitespace-nowrap text-left`}>Utworzono</th>
            <th className={`${th} whitespace-nowrap text-left`}>Oczekiwana</th>
            <th className={`${th} w-[120px] text-right`}>Netto</th>
            <th className={`${th} w-[120px] text-right`}>Brutto</th>
            <th className={`${th} w-[70px] text-right`}>Poz.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const sc = scoreBySupplierId[row.supplier_id];
            const tier = supplierScoreTier(sc);
            const net = row.total_net ?? row.total_value ?? 0;
            const gross = row.total_gross ?? net + (row.total_vat ?? 0);
            return (
              <tr key={row.id} className={panelListDenseRowClass}>
                <td
                  className={`${panelListDenseTdBase} ${operationalActionsColumnWidthClass} !px-1 !py-1 text-center !align-top`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <OperationalActionColumn
                    aria-label="Akcje zamówienia towaru"
                    slots={[
                      <OperationalActionButton key="edit" aria-label="Edytuj" title="Edytuj" onClick={() => onEdit(row.id)}>
                        <Pencil className="text-slate-600" strokeWidth={2} />
                      </OperationalActionButton>,
                      <div key="print" className="relative flex justify-center" data-print-menu-root>
                        <OperationalActionButton
                          aria-label="Drukuj"
                          title="Drukuj / PDF"
                          onClick={() => onPrintMenuToggle(row.id)}
                        >
                          <Printer className="text-slate-600" strokeWidth={2} />
                        </OperationalActionButton>
                        {printMenuOpenId === row.id ? (
                          <div className="absolute left-1/2 top-full z-[320] mt-1 w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                              onClick={() => {
                                onPrintDirect(row.id);
                              }}
                            >
                              Drukuj
                            </button>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                              onClick={() => {
                                onOpenPdf(row.id);
                              }}
                            >
                              Pobierz PDF
                            </button>
                          </div>
                        ) : null}
                      </div>,
                      canCreatePz(row) ? (
                        <OperationalActionButton
                          key="pz"
                          title="Przyjęcie dostawy (dokument magazynowy)"
                          onClick={() => onPz(row.id)}
                        >
                          <span className="text-xs font-semibold leading-none tabular-nums">PZ</span>
                        </OperationalActionButton>
                      ) : null,
                      <OperationalActionButton
                        key="del"
                        variant="danger"
                        aria-label="Usuń"
                        title={row.status === "draft" ? "Usuń" : "Tylko szkic"}
                        onClick={() => {
                          if (row.status !== "draft") {
                            onToastCannotDelete();
                            return;
                          }
                          onDeleteDraft(row.id);
                        }}
                        className={row.status !== "draft" ? "cursor-not-allowed" : ""}
                        disabled={row.status !== "draft"}
                      >
                        <Trash2 strokeWidth={2} />
                      </OperationalActionButton>,
                    ]}
                  />
                </td>
                <td className={`${panelListDenseTdBase} tabular-nums`}>
                  <span className="font-mono font-semibold text-slate-800">#{row.id}</span>
                </td>
                <td className={`${panelListDenseTdBase} min-w-0`}>
                  <button
                    type="button"
                    onClick={() => onEdit(row.id)}
                    className="block max-w-full truncate text-left font-medium text-sky-800 hover:underline"
                  >
                    {deliveryListLabel(row)}
                  </button>
                </td>
                <td className={`${panelListDenseTdBase} min-w-0 text-slate-800`}>
                  <span className="block truncate" title={row.supplier_name ?? undefined}>
                    {row.supplier_name}
                  </span>
                </td>
                <td className={`${panelListDenseTdBase} text-center`}>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tier.badgeClass}`}>{tier.label}</span>
                </td>
                <td className={`${panelListDenseTdBase} text-center`}>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}
                  >
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </td>
                <td className={`${panelListDenseTdBase} whitespace-nowrap tabular-nums text-slate-600`}>{formatDt(row.created_at)}</td>
                <td className={`${panelListDenseTdBase} whitespace-nowrap tabular-nums text-slate-600`}>{formatDt(row.expected_date)}</td>
                <td className={`${panelListDenseTdBase} text-right tabular-nums font-medium text-slate-900`}>{fmtMoney(net)}</td>
                <td className={`${panelListDenseTdBase} text-right tabular-nums text-slate-800`}>{fmtMoney(gross)}</td>
                <td className={`${panelListDenseTdBase} text-right tabular-nums text-slate-800`}>{row.item_count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
