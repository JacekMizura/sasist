import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Copy, Download, MoreHorizontal, Pencil, Printer, Trash2 } from "lucide-react";

import type { StockDocumentListRow } from "@/api/stockDocumentsApi";
import {
  moduleListRowClass,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
} from "@/components/listPage/moduleList";
import {
  OperationalActionButton,
  OperationalActionColumn,
} from "@/components/operational";
import { operationalActionButtonClass } from "@/components/operational/operationalActionButtonTokens";
import { formatMoneyPl } from "@/utils/formatOrderMoney";
import { DocumentTypeBadge, ExternalStatusBadge } from "./documentsBadges";
import PzWorkflowStatusBadges from "../../components/wms/PzWorkflowStatusBadges";
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

const MENU_Z = 10050;
const MENU_MIN_WIDTH = 176;

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

function RowOverflowMenu({
  docId,
  onDuplicate,
  onDownloadPdf,
}: {
  docId: number;
  onDuplicate: (id: number) => void;
  onDownloadPdf: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const updateMenuPos = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.right - MENU_MIN_WIDTH, window.innerWidth - MENU_MIN_WIDTH - 8));
    let top = rect.bottom + 4;
    const estimatedHeight = 120;
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedHeight - 4);
    }
    setMenuPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(updateMenuPos);
    window.addEventListener("scroll", updateMenuPos, true);
    window.addEventListener("resize", updateMenuPos);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", updateMenuPos, true);
      window.removeEventListener("resize", updateMenuPos);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const menu =
    open && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        role="menu"
        className="overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/60"
        style={
          menuPos
            ? { position: "fixed", top: menuPos.top, left: menuPos.left, minWidth: MENU_MIN_WIDTH, zIndex: MENU_Z }
            : { position: "fixed", visibility: "hidden", zIndex: MENU_Z }
        }
      >
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
          onClick={() => {
            void onDuplicate(docId);
            setOpen(false);
          }}
        >
          <Copy className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          Duplikuj
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
          onClick={() => {
            onDownloadPdf(docId);
            setOpen(false);
          }}
        >
          <Download className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          Pobierz PDF
        </button>
      </div>
    ) : null;

  return (
    <>
      <div ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Więcej akcji"
          title="Więcej"
          onClick={() => setOpen((v) => !v)}
          className={operationalActionButtonClass}
        >
          <MoreHorizontal strokeWidth={2} aria-hidden />
        </button>
      </div>
      {menu && createPortal(menu, document.body)}
    </>
  );
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
  onOpenDetail,
  onDelete,
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
          <span className="font-mono text-base font-semibold tabular-nums text-slate-900">
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
          <div data-print-menu-root>
            <OperationalActionColumn
              layout="stack"
              aria-label={`Akcje dokumentu ${documentDisplayNumber(r)}`}
              slots={[
                <OperationalActionButton
                  key="edit"
                  title="Edytuj"
                  aria-label="Edytuj"
                  onClick={() => onOpenDetail(r.id)}
                >
                  <Pencil className="text-slate-600" strokeWidth={2} aria-hidden />
                </OperationalActionButton>,
                <OperationalActionButton
                  key="print"
                  title="Drukuj"
                  aria-label="Drukuj"
                  onClick={() => onPrint(r.id)}
                >
                  <Printer className="text-slate-600" strokeWidth={2} aria-hidden />
                </OperationalActionButton>,
                <OperationalActionButton
                  key="del"
                  variant="danger"
                  title="Usuń"
                  aria-label="Usuń"
                  onClick={() => onDelete(r.id)}
                >
                  <Trash2 strokeWidth={2} aria-hidden />
                </OperationalActionButton>,
                <RowOverflowMenu
                  key="more"
                  docId={r.id}
                  onDuplicate={onDuplicate}
                  onDownloadPdf={onDownloadPdf}
                />,
              ]}
            />
          </div>
        );
      default:
        return "—";
    }
  }

  return (
    <div className={moduleListTableScrollClass}>
      <table className={moduleListTableClass}>
        <thead className={moduleListTheadClass}>
          <tr>
            {selectionEnabled ? (
              <th className={`${moduleListThClass} w-12`}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleSelectAll?.()}
                  aria-label="Zaznacz wszystkie"
                />
              </th>
            ) : null}
            {columns.map((col) => (
              <th key={col} className={`${moduleListThClass} ${alignClass(col)}`}>
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
              className={moduleListRowClass}
            >
              {selectionEnabled ? (
                <td className={`${moduleListTdClass} w-12 text-center`} onClick={(e) => e.stopPropagation()}>
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
                  className={`${moduleListTdClass} ${alignClass(col)}`}
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
