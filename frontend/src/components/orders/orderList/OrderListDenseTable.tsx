import { useMemo, type CSSProperties } from "react";
import { Eye, FileText, Mail, Truck } from "lucide-react";

import type { OrderUiStatusBrief } from "../../../types/orderUiStatus";
import { ShippingMethodLogo } from "../../shipping/ShippingMethodLogo";
import { ReturnsListProductCell } from "../../returns/returnList/ReturnsListProductCell";
import { OrderPriorityFlameIcon } from "../OrderPriorityFlame";
import type { OrderQuickToolbarActionKind } from "./orderQuickActionKinds";
import { ORDER_LIST_USER_COLUMN_IDS } from "./orderListColumnCatalog";
import {
  ModuleListRowActionsCell,
  ModuleListStatusPill,
} from "../../listPage/moduleList/ModuleListTableParts";
import {
  moduleListChannelBadgeClass,
  moduleListChannelBadgeEmptyClass,
  moduleListRowClass,
  moduleListRowSelectedClass,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListThSortClass,
  moduleListTheadClass,
} from "../../listPage/moduleList/moduleListTableTokens";
import {
  OperationalActionButton,
  OperationalActionColumn,
  panelListDenseCheckboxInputClass,
} from "../../operational";
import { buildOrderListDocumentContextTitle } from "../../../utils/orderListDocumentContextTitle";

const TD = moduleListTdClass;
const TH = moduleListThClass;
const TH_SORT = moduleListThSortClass;

export type OrderListDenseOrder = {
  id: number;
  number?: string;
  status?: string;
  created_at?: string | null;
  order_date?: string | null;
  value?: number | null;
  gross_profit?: number | null;
  margin_percent?: number | null;
  currency?: string | null;
  shipping_method_id?: string | null;
  shipping_method?: string | null;
  shipping_method_logo_url?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  items_preview?: {
    quantity: number;
    name?: string | null;
    ean?: string | null;
    sku?: string | null;
    image_url?: string | null;
  }[];
  items_display_lines?: {
    quantity: number;
    name?: string | null;
    ean?: string | null;
    sku?: string | null;
    image_url?: string | null;
  }[];
  position_count?: number;
  total_items?: number;
  wms_missing_line_count?: number;
  order_ui_status?: OrderUiStatusBrief | null;
  panel_payment_status?: string | null;
  panel_payment_method?: string | null;
  priority_color?: string | null;
  invoice_number?: string | null;
  documents?: unknown[] | null;
  has_invoice?: boolean | null;
  tracking_number?: string | null;
  shipment_id?: string | number | null;
  courier?: string | null;
  comment?: string | null;
  comments_count?: number | null;
  note?: string | null;
  internal_note?: string | null;
  wms_packed_at?: string | null;
  wms_packed_by_label?: string | null;
  wms_workflow_phase?: string | null;
  has_internal_note?: boolean;
  has_customer_comment?: boolean;
  latest_internal_note_preview?: string | null;
  latest_customer_comment_preview?: string | null;
  order_channel?: string | null;
  fulfillment_mode?: string | null;
};

type SortKey =
  | "id"
  | "number"
  | "status"
  | "order_date"
  | "total_volume"
  | "order_type"
  | "total_items"
  | "gross_profit"
  | "margin_percent";

export type OrderListDenseTableProps = {
  orders: OrderListDenseOrder[];
  columnOrder: string[];
  sortBy: SortKey;
  sortDir: "asc" | "desc";
  onToggleSort: (key: SortKey) => void;
  formatOrderDate: (iso: string | null | undefined) => string;
  formatMoney: (value: number | null | undefined, currency: string | null | undefined) => string;
  customerLabel: (o: OrderListDenseOrder) => string;
  deriveOrderListPaymentBadgeRow: (o: {
    panel_payment_status?: string | null;
    panel_payment_method?: string | null;
  }) => { label: string; style: CSSProperties } | null;
  isRowSelected: (id: string) => boolean;
  toggleOne: (id: string, shift: boolean) => void;
  bulkBusy: boolean;
  /** @deprecated Bez wpływu wizualnego — układ jak zwroty. */
  densityCompact?: boolean;
  openOrder: (id: number) => void;
  onRowQuickAction: (orderId: number, kind: OrderQuickToolbarActionKind) => void;
  onRowOpenMulti?: (orderId: number) => void;
  /** Wiersze z domyślnie rozwiniętą listą produktów (mockup / dev). */
  initialExpandedProductOrderIds?: ReadonlySet<number>;
};

function Th({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`${TH_SORT} ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {activeKey === sortKey ? (dir === "asc" ? " ↑" : " ↓") : null}
    </th>
  );
}

function StaticTh({ label, align }: { label: string; align?: "left" | "right" | "center" }) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return <th className={`${TH} ${alignClass}`}>{label}</th>;
}

export function OrderListDenseTable({
  orders,
  columnOrder,
  sortBy,
  sortDir,
  onToggleSort,
  formatOrderDate,
  formatMoney,
  customerLabel,
  deriveOrderListPaymentBadgeRow,
  isRowSelected,
  toggleOne,
  bulkBusy,
  openOrder,
  onRowQuickAction,
  onRowOpenMulti,
  initialExpandedProductOrderIds,
}: OrderListDenseTableProps) {
  const userColumnAllow = useMemo(() => new Set(ORDER_LIST_USER_COLUMN_IDS), []);

  const tableColumns = useMemo(() => {
    const userOrdered = columnOrder.filter((id) => userColumnAllow.has(id));
    const result: string[] = [];
    for (const id of userOrdered) {
      result.push(id);
      if (id === "order_core") result.push("panel_status");
    }
    return result;
  }, [columnOrder, userColumnAllow]);

  const renderHead = (col: string) => {
    switch (col) {
      case "order_core":
        return (
          <Th
            key={col}
            label="Zamówienie / ID"
            sortKey="order_date"
            activeKey={sortBy}
            dir={sortDir}
            onSort={onToggleSort}
          />
        );
      case "panel_status":
        return <StaticTh key={col} label="Status" />;
      case "products":
        return <StaticTh key={col} label="Produkty" />;
      case "customer":
        return <StaticTh key={col} label="Klient" />;
      case "value":
        return <StaticTh key={col} label="Wartość" align="right" />;
      case "gross_profit":
        return (
          <Th
            key={col}
            label="Zysk"
            sortKey="gross_profit"
            activeKey={sortBy}
            dir={sortDir}
            onSort={onToggleSort}
            align="right"
          />
        );
      case "margin_percent":
        return (
          <Th
            key={col}
            label="Marża %"
            sortKey="margin_percent"
            activeKey={sortBy}
            dir={sortDir}
            onSort={onToggleSort}
            align="right"
          />
        );
      case "carrier":
        return <StaticTh key={col} label="Dostawa" />;
      default:
        return null;
    }
  };

  const renderCell = (col: string, o: OrderListDenseOrder) => {
    const displayLines = (o.items_display_lines?.length ? o.items_display_lines : o.items_preview) ?? [];
    const payRow = deriveOrderListPaymentBadgeRow({
      panel_payment_status: o.panel_payment_status,
      panel_payment_method: o.panel_payment_method,
    });
    const shipMethod = (o.shipping_method ?? "").trim();
    const tracking = (o.tracking_number ?? "").trim();
    const uiStatus = o.order_ui_status ?? null;
    const uiTerminal = uiStatus?.main_group === "DONE";

    switch (col) {
      case "order_core":
        return (
          <td key={col} className={`${TD} min-w-[11rem]`}>
            <div
              className="inline-flex items-center gap-1 font-medium text-slate-900"
              title={buildOrderListDocumentContextTitle({
                orderNumber: o.number,
                orderId: o.id,
                orderChannel: o.order_channel,
                fulfillmentMode: o.fulfillment_mode,
                workflowPhase: o.wms_workflow_phase,
                packedAtIso: o.wms_packed_at,
                packedByLabel: o.wms_packed_by_label,
                missingLineCount: o.wms_missing_line_count,
              })}
            >
              <OrderPriorityFlameIcon priorityColor={o.priority_color} />
              #{o.number ?? o.id}
            </div>
            <div className="mt-1 text-xs text-slate-400">{formatOrderDate(o.order_date)}</div>
          </td>
        );
      case "panel_status":
        return (
          <td key={col} className={`${TD} min-w-[10rem]`}>
            <ModuleListStatusPill
              status={uiStatus}
              terminal={uiTerminal}
              terminalPositive={uiTerminal}
            />
          </td>
        );
      case "products":
        return (
          <td key={col} className={`${TD} min-w-[14rem] whitespace-normal !py-3`}>
            <ReturnsListProductCell
              lines={displayLines}
              initialExpanded={initialExpandedProductOrderIds?.has(o.id) ?? false}
            />
          </td>
        );
      case "customer":
        return (
          <td key={col} className={`${TD} min-w-[10rem] whitespace-normal break-words text-slate-600`}>
            {customerLabel(o)}
          </td>
        );
      case "value":
        return (
          <td key={col} className={`${TD} text-right`}>
            <div className="font-medium tabular-nums text-slate-900">{formatMoney(o.value, o.currency)}</div>
            {payRow ? (
              <div className="mt-1 text-xs text-slate-400">{payRow.label}</div>
            ) : null}
          </td>
        );
      case "carrier": {
        const shipEmpty = !shipMethod;
        return (
          <td key={col} className={TD}>
            <div className="flex flex-col items-start gap-1.5">
              <ShippingMethodLogo
                logoUrl={o.shipping_method_logo_url}
                methodName={o.shipping_method}
                size="orderList"
                placeholder="package"
              />
              <span className={shipEmpty ? moduleListChannelBadgeEmptyClass : moduleListChannelBadgeClass}>
                {shipEmpty ? "—" : shipMethod}
              </span>
              {tracking ? (
                <span className="text-xs tabular-nums text-slate-500" title={tracking}>
                  {tracking}
                </span>
              ) : null}
            </div>
          </td>
        );
      }
      case "gross_profit": {
        const gp = o.gross_profit;
        const margin = o.margin_percent;
        const tone =
          gp == null || Number.isNaN(Number(gp))
            ? "text-slate-500"
            : Number(gp) < 0
              ? "text-red-700"
              : margin != null && Number.isFinite(Number(margin)) && Number(margin) < 10
                ? "text-amber-700"
                : "text-emerald-700";
        return (
          <td key={col} className={`${TD} text-right`}>
            <div className={`font-medium tabular-nums ${tone}`}>{formatMoney(gp, o.currency)}</div>
          </td>
        );
      }
      case "margin_percent":
        return (
          <td key={col} className={`${TD} text-right`}>
            <div className="font-medium tabular-nums text-slate-900">
              {o.margin_percent != null && Number.isFinite(Number(o.margin_percent))
                ? `${Number(o.margin_percent).toFixed(2)}%`
                : "—"}
            </div>
          </td>
        );
      default:
        return null;
    }
  };

  return (
    <div className={moduleListTableScrollClass}>
      <table className={moduleListTableClass}>
        <thead className={moduleListTheadClass}>
          <tr>
            <th className={`${TH} w-12 text-center`}>
              <span className="sr-only">Zaznacz</span>
            </th>
            {tableColumns.map((c) => renderHead(c))}
            <StaticTh label="Akcje" align="center" />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const selected = isRowSelected(String(o.id));
            return (
              <tr
                key={o.id}
                className={`${moduleListRowClass} ${selected ? moduleListRowSelectedClass : ""}`}
                onClick={() => openOrder(o.id)}
              >
                <td className={`${TD} w-12 text-center`} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={bulkBusy}
                    onChange={(e) => toggleOne(String(o.id), (e.nativeEvent as MouseEvent).shiftKey ?? false)}
                    className={panelListDenseCheckboxInputClass}
                    aria-label={`Zaznacz zamówienie ${o.number ?? o.id}`}
                  />
                </td>
                {tableColumns.map((c) => renderCell(c, o))}
                <ModuleListRowActionsCell ariaLabel="Akcje zamówienia">
                  <OperationalActionColumn
                    layout="stack"
                    aria-label="Akcje zamówienia"
                    slots={[
                      <OperationalActionButton
                        key="eye"
                        disabled={bulkBusy}
                        title="Szczegóły"
                        aria-label="Szczegóły zamówienia"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openOrder(o.id);
                        }}
                      >
                        <Eye className="text-slate-600" strokeWidth={2} aria-hidden />
                      </OperationalActionButton>,
                      <OperationalActionButton
                        key="doc"
                        disabled={bulkBusy}
                        title="Wystaw dokument"
                        aria-label="Wystaw dokument"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRowQuickAction(o.id, "issue_document");
                        }}
                      >
                        <FileText className="text-slate-600" strokeWidth={2} aria-hidden />
                      </OperationalActionButton>,
                      <OperationalActionButton
                        key="truck"
                        disabled={bulkBusy || !onRowOpenMulti}
                        title="Multiakcje"
                        aria-label="Multiakcje"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRowOpenMulti?.(o.id);
                        }}
                      >
                        <Truck className="text-slate-600" strokeWidth={2} aria-hidden />
                      </OperationalActionButton>,
                      <OperationalActionButton
                        key="mail"
                        disabled={bulkBusy}
                        title="Wiadomość"
                        aria-label="Wyślij wiadomość"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRowQuickAction(o.id, "send_message");
                        }}
                      >
                        <Mail className="text-slate-600" strokeWidth={2} aria-hidden />
                      </OperationalActionButton>,
                    ]}
                  />
                </ModuleListRowActionsCell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
