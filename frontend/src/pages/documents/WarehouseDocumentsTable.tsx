import { Link } from "react-router-dom";

import type { StockDocumentListRow } from "@/api/stockDocumentsApi";
import { formatMoneyPl } from "@/utils/formatOrderMoney";
import { DocumentTypeBadge, ExternalStatusBadge } from "./documentsBadges";
import PzWorkflowStatusBadges from "../../components/wms/PzWorkflowStatusBadges";
import { documentsTableTheadCls } from "./documentsDashboardPrimitives";
import { warehouseDocumentListStatus } from "./warehouseDocumentsUi";
import {
  getWarehouseDocumentConfig,
  WAREHOUSE_COLUMN_LABELS,
  type WarehouseListColumnId,
} from "./warehouseDocumentConfigs";
import {
  documentDisplayNumber,
  documentSourceLabel,
  listValueGross,
  listValueNet,
  mmFromLabel,
  mmToLabel,
  operatorLabel,
  seriesCode,
  totalQuantity,
} from "./warehouseDocumentHelpers";

function formatDateShort(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

function fmtMoneyCur(n: number | null | undefined, currency: string | undefined) {
  const c = (currency || "PLN").trim() || "PLN";
  if (n == null || !Number.isFinite(n)) return "—";
  if (c === "PLN" || c === "zł") return formatMoneyPl(n);
  return formatMoneyPl(n, { currency: c });
}

function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 6 }).format(n);
}

function alignClass(col: WarehouseListColumnId): string {
  if (col === "actions") return "text-right";
  if (["net", "vat", "gross", "value", "lineCount", "totalQty"].includes(col)) return "text-right";
  return "text-left";
}

type Props = {
  rows: StockDocumentListRow[];
  docType: string;
  printMenuOpenId: number | null;
  onOpenDetail: (id: number) => void;
  onDelete: (id: number) => void;
  onPrintMenuToggle: (id: number | null) => void;
  onPrint: (id: number) => void;
  onDownloadPdf: (id: number) => void;
  onDuplicate: (id: number) => void;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onToggleSelectAll?: () => void;
  allSelected?: boolean;
};

export default function WarehouseDocumentsTable({
  rows,
  docType,
  printMenuOpenId,
  onOpenDetail,
  onDelete,
  onPrintMenuToggle,
  onPrint,
  onDownloadPdf,
  onDuplicate,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allSelected = false,
}: Props) {
  const selectionEnabled = selectedIds != null && onToggleSelect != null;
  const config = getWarehouseDocumentConfig(docType);
  const columns = config.columns;

  function renderCell(col: WarehouseListColumnId, r: StockDocumentListRow) {
    const dt = config.type;
    const st = warehouseDocumentListStatus({
      status: r.status,
      document_type: r.document_type,
      total_received: r.total_received,
      receiving_status: r.receiving_status,
      putaway_status: r.putaway_status,
      relocation_status: r.relocation_status,
      is_fully_received: r.is_fully_received,
      is_fully_putaway: r.is_fully_putaway,
    });

    switch (col) {
      case "documentNumber":
        return (
          <span className="font-mono text-lg font-bold tabular-nums text-slate-900">
            {documentDisplayNumber(r)}
          </span>
        );
      case "series":
        return <span className="font-medium text-slate-800">{seriesCode(r)}</span>;
      case "type":
        return <DocumentTypeBadge code={dt} />;
      case "date":
        return <span className="whitespace-nowrap tabular-nums text-slate-600">{formatDateShort(r.created_at)}</span>;
      case "warehouse":
        return (
          <span className="text-slate-800">
            {(r.warehouse_name || "").trim() || (r.warehouse_id != null ? `#${r.warehouse_id}` : "—")}
          </span>
        );
      case "operator":
        return <span className="text-slate-700">{operatorLabel(r)}</span>;
      case "lineCount":
        return <span className="tabular-nums text-slate-800">{r.line_count}</span>;
      case "totalQty":
        return <span className="tabular-nums text-slate-800">{fmtQty(totalQuantity(r))}</span>;
      case "net":
        return <span className="tabular-nums text-slate-800">{fmtMoneyCur(r.total_net, r.currency)}</span>;
      case "vat":
        return <span className="tabular-nums text-slate-800">{fmtMoneyCur(r.total_vat, r.currency)}</span>;
      case "gross":
        return <span className="tabular-nums text-slate-800">{fmtMoneyCur(r.total_gross, r.currency)}</span>;
      case "value": {
        const val =
          config.valueField === "gross"
            ? listValueGross(r) ?? listValueNet(r, dt)
            : listValueNet(r, dt);
        return <span className="tabular-nums font-semibold text-slate-900">{fmtMoneyCur(val, r.currency)}</span>;
      }
      case "status":
        if (dt === "PZ" || dt === "Z_PZ") {
          return (
            <PzWorkflowStatusBadges
              documentType={r.document_type}
              warehouseWorkflowStatus={r.warehouse_workflow_status}
              purchaseWorkflowStatus={r.purchase_workflow_status}
              receiving_status={r.receiving_status}
              putaway_status={r.putaway_status}
              relocation_status={r.relocation_status}
              status={r.status}
            />
          );
        }
        return <ExternalStatusBadge status={st} />;
      case "customer":
        return (
          <span className="max-w-[14rem] truncate text-slate-800" title={(r.customer_name || "").trim()}>
            {(r.customer_name || "").trim() || "—"}
          </span>
        );
      case "supplier":
        return (
          <span className="max-w-[14rem] truncate text-slate-800" title={(r.supplier_name || "").trim()}>
            {(r.supplier_name || "").trim() || "—"}
          </span>
        );
      case "sourceReason":
        return <span className="text-sm text-slate-700">{documentSourceLabel(r)}</span>;
      case "mmFrom":
        return <span className="text-slate-800">{mmFromLabel(r)}</span>;
      case "mmTo":
        return <span className="text-slate-800">{mmToLabel(r)}</span>;
      case "actions":
        return (
          <div className="flex flex-wrap items-center justify-end gap-1" data-print-menu-root>
            <button
              type="button"
              aria-label="Edytuj"
              title="Edytuj"
              onClick={() => onOpenDetail(r.id)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg leading-none hover:bg-slate-50"
            >
              ✏️
            </button>
            <button
              type="button"
              aria-label="Usuń"
              title="Usuń"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(r.id);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-lg leading-none text-rose-900 hover:bg-rose-100"
            >
              🗑
            </button>
            <div className="relative inline-flex">
              <button
                type="button"
                aria-label="Drukuj"
                title="Drukuj / PDF"
                onClick={(e) => {
                  e.stopPropagation();
                  onPrintMenuToggle(printMenuOpenId === r.id ? null : r.id);
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg leading-none hover:bg-slate-50"
              >
                🖨
              </button>
              {printMenuOpenId === r.id ? (
                <div className="absolute right-0 z-[320] mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPrint(r.id);
                      onPrintMenuToggle(null);
                    }}
                  >
                    Drukuj
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownloadPdf(r.id);
                      onPrintMenuToggle(null);
                    }}
                  >
                    Pobierz PDF
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Duplikuj"
              title="Duplikuj"
              onClick={(e) => {
                e.stopPropagation();
                void onDuplicate(r.id);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg leading-none hover:bg-slate-50"
            >
              📋
            </button>
          </div>
        );
      default:
        return "—";
    }
  }

  const minWidth = Math.max(720, columns.length * 110);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-base" style={{ minWidth: `${minWidth}px` }}>
        <thead className={`text-left ${documentsTableTheadCls}`}>
          <tr>
            {selectionEnabled ? (
              <th className="w-12 px-3 py-3.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleSelectAll?.()}
                  aria-label="Zaznacz wszystkie"
                />
              </th>
            ) : null}
            {columns.map((col) => (
              <th
                key={col}
                className={`px-4 py-3.5 text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm ${alignClass(col)}`}
              >
                {WAREHOUSE_COLUMN_LABELS[col]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenDetail(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenDetail(r.id);
                }
              }}
              className="cursor-pointer border-t border-slate-100 transition-colors odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/80"
            >
              {selectionEnabled ? (
                <td className="w-12 px-3 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds?.has(r.id) ?? false}
                    onChange={() => onToggleSelect?.(r.id)}
                    aria-label={`Zaznacz dokument ${r.id}`}
                  />
                </td>
              ) : null}
              {columns.map((col) => (
                <td
                  key={col}
                  className={`px-4 py-4 sm:px-5 sm:py-5 ${alignClass(col)}`}
                  onClick={col === "actions" ? (e) => e.stopPropagation() : undefined}
                >
                  {col === "customer" && r.order_id != null ? (
                    <Link
                      to={`/orders/${r.order_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900"
                    >
                      {(r.customer_name || "").trim() || `#${r.order_id}`}
                    </Link>
                  ) : (
                    renderCell(col, r)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
