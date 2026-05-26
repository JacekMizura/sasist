import { useMemo, type CSSProperties } from "react";
import { FileText, Mail, Pencil, Pin, Truck } from "lucide-react";
import type { OrderUiStatusBrief } from "../../../types/orderUiStatus";
import { ShippingMethodLogo } from "../../shipping/ShippingMethodLogo";
import { PanelListDenseProductCell } from "../../panelList/PanelListDenseProductCell";
import { priorityStripeBarClass } from "../orderPriority";
import { OrderPriorityFlameIcon } from "../OrderPriorityFlame";
import { OrderUiStatusConfigRowPresent } from "./OrderUiStatusConfigRowPresent";
import type { OrderQuickToolbarActionKind } from "./orderQuickActionKinds";
import { ORDER_LIST_USER_COLUMN_IDS } from "./orderListColumnCatalog";
import {
  OperationalActionButton,
  OperationalActionColumn,
  operationalActionsColumnCellClass,
  operationalActionsColumnHeaderClass,
  operationalCheckboxColumnCellClass,
  operationalCheckboxColumnHeaderClass,
  panelListDenseCheckboxInputClass,
  panelListDenseRowClass,
  panelListDenseRowSelectedClass,
  panelListDenseTableClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseThSort,
  panelListDenseTheadClass,
} from "../../operational";
import { OrderWmsOperationalBadge } from "./OrderWmsOperationalBadge";
import { shouldShowOrderWmsOperationalBadge } from "../../../utils/orderWmsOperationalBadgeVisibility";
import { HoverPopover } from "../../ui/HoverPopover";

const ORDER_TH = panelListDenseThBase;
const ORDER_TD = panelListDenseTdBase;
const ORDER_TH_SORT = panelListDenseThSort;

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
  /** ISO — pełne spakowanie w WMS (``orders.packed_at``). */
  wms_packed_at?: string | null;
  wms_packed_by_label?: string | null;
  /** Kod fazy z backendu: TO_PICK | PICKING | … | PACKED */
  wms_workflow_phase?: string | null;
  has_internal_note?: boolean;
  has_customer_comment?: boolean;
  latest_internal_note_preview?: string | null;
  latest_customer_comment_preview?: string | null;
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
  /** Zwarte odstępy w komórkach (toolbar „gęstość”). */
  densityCompact?: boolean;
  openOrder: (id: number) => void;
  onRowQuickAction: (orderId: number, kind: OrderQuickToolbarActionKind) => void;
  /** Zaznacza wiersz i otwiera modal multiakcji (np. dostawa). */
  onRowOpenMulti?: (orderId: number) => void;
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
      className={`${ORDER_TH_SORT} ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {activeKey === sortKey && (dir === "asc" ? " ↑" : " ↓")}
    </th>
  );
}

function StaticTh({ label, align }: { label: string; align?: "left" | "right" }) {
  return (
    <th className={`${ORDER_TH} ${align === "right" ? "text-right" : "text-left"}`}>{label}</th>
  );
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
  densityCompact = false,
  openOrder,
  onRowQuickAction,
  onRowOpenMulti,
}: OrderListDenseTableProps) {
  const TD = densityCompact ? `${ORDER_TD} !py-1.5` : ORDER_TD;
  const userColumnAllow = useMemo(() => new Set(ORDER_LIST_USER_COLUMN_IDS), []);
  const displayColumns = useMemo(() => {
    const userOrdered = columnOrder.filter((id) => userColumnAllow.has(id));
    return ["actions", ...userOrdered];
  }, [columnOrder, userColumnAllow]);

  /** Kolumna „actions” jest scalona z checkboxem w jednym `<td>` — tu tylko pozostałe kolumny. */
  const tableColumns = useMemo(() => displayColumns.filter((c) => c !== "actions"), [displayColumns]);

  const renderHead = (col: string) => {
    switch (col) {
      case "order_core":
        return (
          <Th
            key={col}
            label="Zamówienie"
            sortKey="order_date"
            activeKey={sortBy}
            dir={sortDir}
            onSort={onToggleSort}
          />
        );
      case "products":
        return <StaticTh key={col} label="Produkty" />;
      case "customer":
        return <StaticTh key={col} label="Klient" />;
      case "value":
        return <StaticTh key={col} label="Wartość / płatność" align="right" />;
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

  /** >3 actions → two-column row-major stack (see `OperationalActionColumn`). */
  const renderOrderActionsCluster = (o: OrderListDenseOrder) => {
    const pinActive =
      Boolean(o.has_internal_note) || Boolean((o.latest_internal_note_preview ?? "").trim());
    const envelopeActive =
      Boolean(o.has_customer_comment) || Boolean((o.latest_customer_comment_preview ?? "").trim());

    return (
    <OperationalActionColumn
      aria-label="Szybkie akcje zamówienia"
      slots={[
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
          <FileText strokeWidth={2} aria-hidden />
        </OperationalActionButton>,
        <OperationalActionButton
          key="truck"
          disabled={bulkBusy || !onRowOpenMulti}
          title="Multiakcje (dostawa i inne)"
          aria-label="Multiakcje — dostawa"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRowOpenMulti?.(o.id);
          }}
        >
          <Truck strokeWidth={2} aria-hidden />
        </OperationalActionButton>,
        <HoverPopover
          key="mail-pop"
          content={
            (o.latest_customer_comment_preview ?? "").trim() ||
            (o.has_customer_comment ? "(Treść w szczegółach zamówienia)" : "Brak wiadomości od klienta")
          }
        >
          <OperationalActionButton
            key="mail"
            disabled={bulkBusy}
            aria-label="Wyślij wiadomość — komunikacja z klientem"
            className={
              envelopeActive
                ? "!border-emerald-300/90 !bg-emerald-50 !text-emerald-700 shadow-sm"
                : ""
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRowQuickAction(o.id, "send_message");
            }}
          >
            <Mail strokeWidth={2} aria-hidden />
          </OperationalActionButton>
        </HoverPopover>,
        <OperationalActionButton
          key="edit"
          disabled={bulkBusy}
          title="Szczegóły zamówienia"
          aria-label="Otwórz zamówienie"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openOrder(o.id);
          }}
        >
          <Pencil strokeWidth={2} aria-hidden />
        </OperationalActionButton>,
        <HoverPopover
          key="pin-pop"
          content={
            (o.latest_internal_note_preview ?? "").trim() ||
            (o.has_internal_note ? "(Szczegóły w notatkach operacyjnych)" : "Brak notatek magazynowych")
          }
        >
          <OperationalActionButton
            key="pin"
            disabled={bulkBusy}
            aria-label="Notatki operacyjne magazynu"
            className={
              pinActive ? "!border-red-300/90 !bg-red-50 !text-red-700 shadow-sm" : ""
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRowQuickAction(o.id, "operational_notes");
            }}
          >
            <Pin strokeWidth={2} aria-hidden />
          </OperationalActionButton>
        </HoverPopover>,
      ]}
    />
    );
  };

  const renderCell = (col: string, o: OrderListDenseOrder) => {
    const displayLines = (o.items_display_lines?.length ? o.items_display_lines : o.items_preview) ?? [];
    const more = Math.max(0, displayLines.length - 2);
    const payRow = deriveOrderListPaymentBadgeRow({
      panel_payment_status: o.panel_payment_status,
      panel_payment_method: o.panel_payment_method,
    });
    const shipMethod = (o.shipping_method ?? "").trim();
    const tracking = (o.tracking_number ?? "").trim();
    const shippingLogo = (
      <span title={shipMethod || undefined}>
        <ShippingMethodLogo
          logoUrl={o.shipping_method_logo_url}
          methodName={o.shipping_method}
          size="orderList"
          placeholder="package"
        />
      </span>
    );
    switch (col) {
      case "order_core":
        return (
          <td key={col} className={`${TD} min-w-[14rem] align-top`}>
            <div className="flex flex-col gap-1 text-left">
              <div className="text-xs tabular-nums leading-snug text-slate-500">{formatOrderDate(o.order_date)}</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openOrder(o.id);
                }}
                className="inline-flex w-fit items-center gap-1 text-left text-sm font-semibold text-blue-600 hover:underline"
              >
                <OrderPriorityFlameIcon priorityColor={o.priority_color} />
                #{o.number ?? o.id}
              </button>
              <div className="flex flex-col items-start gap-1">
                <div className="flex flex-wrap items-center gap-1">
                  <OrderUiStatusConfigRowPresent variant="inline" status={o.order_ui_status ?? null} />
                </div>
                {shouldShowOrderWmsOperationalBadge({
                  workflowPhase: o.wms_workflow_phase,
                  packedAtIso: o.wms_packed_at,
                  missingLineCount: o.wms_missing_line_count,
                }) ? (
                  <OrderWmsOperationalBadge
                    workflowPhase={o.wms_workflow_phase}
                    packedAtIso={o.wms_packed_at}
                    packedByLabel={o.wms_packed_by_label}
                  />
                ) : null}
              </div>
            </div>
          </td>
        );
      case "products":
        return (
          <td key={col} className={`${TD} min-w-[12rem] whitespace-normal align-top`}>
            <PanelListDenseProductCell
              lines={displayLines}
              more={more}
              wmsMissingLineCount={o.wms_missing_line_count ?? 0}
            />
          </td>
        );
      case "customer":
        return (
          <td key={col} className={`${TD} min-w-[10rem] whitespace-normal break-words text-slate-800`}>
            {customerLabel(o)}
          </td>
        );
      case "value":
        return (
          <td key={col} className={`${TD} max-w-[10rem] text-right align-top`}>
            <div className="flex flex-col items-end gap-1">
              <div className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(o.value, o.currency)}</div>
              {payRow ? (
                <div
                  className="inline-flex h-5 max-w-full items-center justify-center rounded-full px-2 text-[11px] font-semibold leading-none"
                  style={payRow.style}
                >
                  <span className="min-w-0 truncate">{payRow.label}</span>
                </div>
              ) : null}
            </div>
          </td>
        );
      case "carrier":
        return (
          <td key={col} className={`${TD} min-w-[5.5rem] max-w-[9rem] align-top`}>
            <div className="flex flex-col items-start gap-1">
              <div className="flex justify-start">{shippingLogo}</div>
              {shipMethod ? (
                <span className="line-clamp-2 text-left text-[11px] font-medium leading-snug text-slate-800" title={shipMethod}>
                  {shipMethod}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">—</span>
              )}
              {tracking ? (
                <span
                  className="inline-flex max-w-full items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-700"
                  title={tracking}
                >
                  <span className="truncate">{tracking}</span>
                </span>
              ) : null}
            </div>
          </td>
        );
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
            <div className={`text-sm font-semibold tabular-nums ${tone}`}>{formatMoney(gp, o.currency)}</div>
          </td>
        );
      }
      case "margin_percent":
        return (
          <td key={col} className={`${TD} text-right`}>
            <div className="text-sm font-medium tabular-nums text-slate-900">
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
    <div className={panelListDenseTableScrollWrapClass}>
      <table className={panelListDenseTableClass}>
        <thead className={panelListDenseTheadClass}>
          <tr>
            <th className={operationalCheckboxColumnHeaderClass}>
              <span className="sr-only">Zaznacz zamówienie</span>
            </th>
            <th className={operationalActionsColumnHeaderClass}>Akcje</th>
            {tableColumns.map((c) => renderHead(c))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            (() => {
              const row = o;
              return (
                <tr
                  key={row.id}
                  className={`${panelListDenseRowClass} ${densityCompact ? "!py-0.5" : ""} ${isRowSelected(String(row.id)) ? panelListDenseRowSelectedClass : ""}`}
                  onClick={() => openOrder(row.id)}
                >
                  <td className={operationalCheckboxColumnCellClass} onClick={(e) => e.stopPropagation()}>
                    <div
                      className={`flex items-stretch justify-center gap-1.5 ${densityCompact ? "min-h-[1.75rem]" : "min-h-[2.25rem]"}`}
                    >
                      <div
                        className={`w-1 shrink-0 rounded-sm ${priorityStripeBarClass(row.priority_color)}`}
                        aria-hidden
                      />
                      <div className="flex flex-1 items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isRowSelected(String(row.id))}
                          disabled={bulkBusy}
                          onChange={(e) => toggleOne(String(row.id), (e.nativeEvent as MouseEvent).shiftKey ?? false)}
                          className={panelListDenseCheckboxInputClass}
                          aria-label={`Zaznacz zamówienie ${row.id}`}
                        />
                      </div>
                    </div>
                  </td>
                  <td className={operationalActionsColumnCellClass} onClick={(e) => e.stopPropagation()}>
                    {renderOrderActionsCluster(row)}
                  </td>
                  {tableColumns.map((c) => renderCell(c, row))}
                </tr>
              );
            })()
          ))}
        </tbody>
      </table>
    </div>
  );
}
