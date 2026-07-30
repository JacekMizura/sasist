import type { Dispatch, RefObject, SetStateAction } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Home,
  Mail,
  MessageSquareWarning,
  Pin,
} from "lucide-react";

import { OrderDocumentsPrintMenu } from "./OrderDocumentsPrintMenu";
import { OrderDirectSalesBadge } from "./orderList/OrderDirectSalesBadge";
import { OrderPriorityFlamePicker } from "./OrderPriorityFlame";
import { OrderDetailPrimaryStatusDropdown } from "./OrderDetailPrimaryStatusDropdown";
import { OrderDetailProcessStatusRow } from "./OrderDetailProcessStatusRow";
import { OrderUiStatusConfigRowPresent } from "./orderList/OrderUiStatusConfigRowPresent";
import { ORDERS_PANEL_GROUP_LABELS } from "./OrderStatusSidebar";
import { odHeaderIconBtnClass } from "./orderDetailUiTokens";
import { DETAIL_TABS, type DetailTabId } from "./orderDetailTabs";
import type { OrderDetail } from "./orderDetailPageTypes";
import { patchOrderUiStatus } from "../../api/orderUiStatusApi";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import type { PanelConfigurableUiStatusBrief } from "../../utils/panelListStatusBriefMappers";
import { WMS_ROUTES } from "../../pages/wms/wmsRoutes";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { tabsNavItemClassName } from "../layout/TabsNav";
import { DAMAGE_TENANT_ID } from "../../pages/damage/damageShared";
import type { DocumentPrintRequest } from "../../utils/documentTemplatePrint";

const ORDER_DETAIL_HEADER_ICON_BTN = odHeaderIconBtnClass;

function orderOfficePinStorageKey(orderId: number): string {
  return `order_office_pin:${orderId}`;
}

function formatExternalIdSnippet(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return s.length > 28 ? `${s.slice(0, 14)}…${s.slice(-8)}` : s;
}

type WmsDualWorkflow = { total: number; pickedSum: number; packed: number; vehicle: string } | null;

type Props = {
  order: OrderDetail;
  setOrder: Dispatch<SetStateAction<OrderDetail | null>>;
  locationState: unknown;
  navigate: (path: string, opts?: { state?: unknown }) => void;
  prevOrderId: number | null;
  nextOrderId: number | null;
  dateLine: string;
  officePin: boolean;
  setOfficePin: Dispatch<SetStateAction<boolean>>;
  activeTab: DetailTabId;
  setActiveTab: Dispatch<SetStateAction<DetailTabId>>;
  returnsComplaintsRef: RefObject<HTMLDivElement>;
  setReturnsComplaintsOpen: Dispatch<SetStateAction<boolean>>;
  requestOrderDocumentPrint: (req: DocumentPrintRequest, opts?: { autoPrint?: boolean }) => Promise<void>;
  orderDocumentPrintBusy: boolean;
  isStationarySale: boolean;
  orderFulfillmentWhId: number | null;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[] | null;
  panelSaving: boolean;
  setPanelSaving: Dispatch<SetStateAction<boolean>>;
  loadPanelSummary: () => Promise<void>;
  panelOrderStatusBrief: PanelConfigurableUiStatusBrief | null;
  wmsDualWorkflow: WmsDualWorkflow;
  shippingLabel: string;
};

/**
 * Order-detail header: breadcrumb, title row, process status row, tabs strip.
 * Fulfillment warehouse / consolidation / assignment history live on the products (WMS) tab.
 */
export function OrderDetailHeaderBar({
  order,
  setOrder,
  locationState,
  navigate,
  prevOrderId,
  nextOrderId,
  dateLine,
  officePin,
  setOfficePin,
  activeTab,
  setActiveTab,
  returnsComplaintsRef,
  setReturnsComplaintsOpen,
  requestOrderDocumentPrint,
  orderDocumentPrintBusy,
  isStationarySale,
  orderFulfillmentWhId,
  panelSummary,
  panelSubgroups,
  panelSaving,
  setPanelSaving,
  loadPanelSummary,
  panelOrderStatusBrief,
  wmsDualWorkflow,
  shippingLabel,
}: Props) {
  return (
    <div className="w-full flex-col lg:flex-row lg:items-start p-6 pb-0 max-w-full mx-auto">
        <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Ścieżka nawigacji">
          <Link to="/dashboard" className="inline-flex items-center gap-1 font-medium text-slate-500 transition hover:text-slate-800">
            <Home className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          <Link to="/orders/list" className="font-medium text-slate-500 transition hover:text-slate-800">Zamówienia</Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          <span className="font-medium text-slate-900">#{order.number ?? order.id}</span>
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 lg:flex-nowrap lg:gap-x-3 pb-4">
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" disabled={prevOrderId == null} onClick={() => prevOrderId != null && navigate(`/orders/${prevOrderId}`, { state: locationState })} className={ORDER_DETAIL_HEADER_ICON_BTN}>
                  <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} />
                </button>
                <button type="button" disabled={nextOrderId == null} onClick={() => nextOrderId != null && navigate(`/orders/${nextOrderId}`, { state: locationState })} className={ORDER_DETAIL_HEADER_ICON_BTN}>
                  <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} />
                </button>
                <div className="mx-0.5 hidden h-6 w-px shrink-0 bg-slate-200 sm:block" />
                <OrderPriorityFlamePicker orderId={order.id} priorityColor={order.priority_color ?? null} compactTrigger onUpdated={(next) => setOrder((prev) => (prev ? { ...prev, priority_color: next } : prev))} />
              </div>

              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 lg:min-w-[12rem]">
                  <h1 className="flex items-baseline gap-2 text-2xl font-normal text-slate-900">
                    Zamówienie{" "}
                    <span className="border-b border-dashed border-slate-400 text-3xl font-bold tracking-tight">
                      {order.number ?? order.id}
                    </span>
                  </h1>
                  <div className="ml-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                    {formatExternalIdSnippet(order.external_id) ? (
                      <span>
                        ID zew:{" "}
                        <span className="cursor-help border-b border-dashed border-slate-400" title={order.external_id ?? undefined}>
                          {formatExternalIdSnippet(order.external_id)}
                        </span>
                      </span>
                    ) : null}
                    <span>{dateLine}</span>
                    {(order.source ?? "").trim() ? (
                      <span className="hidden md:inline">{(order.source ?? "").trim()}</span>
                    ) : null}
                    <OrderDirectSalesBadge orderChannel={order.order_channel} fulfillmentMode={order.fulfillment_mode} />
                  </div>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => { if (!order?.id) return; setOfficePin((p) => { const next = !p; try { if (next) window.localStorage.setItem(orderOfficePinStorageKey(order.id), "1"); else window.localStorage.removeItem(orderOfficePinStorageKey(order.id)); } catch {} return next; }); }} className={`${ORDER_DETAIL_HEADER_ICON_BTN} ${officePin ? "border-amber-400 bg-amber-50 text-amber-600" : ""}`}>
                    <Bookmark className={`h-4 w-4 shrink-0 ${officePin ? "fill-current" : ""}`} strokeWidth={2} />
                  </button>
                  <button type="button" onClick={() => { setActiveTab("summary"); window.setTimeout(() => { document.getElementById("order-summary-operational-notes")?.scrollIntoView({ behavior: "smooth" }); }, 0); }} className={`${ORDER_DETAIL_HEADER_ICON_BTN} ${order?.has_internal_note ? "border-red-300 bg-red-50 text-red-700" : ""}`}>
                    <Pin className="h-4 w-4 shrink-0" strokeWidth={2} />
                  </button>
                  <div className="relative" ref={returnsComplaintsRef}>
                    <button type="button" onClick={() => setReturnsComplaintsOpen((v) => !v)} className={ORDER_DETAIL_HEADER_ICON_BTN}>
                      <MessageSquareWarning className="h-4 w-4 shrink-0" strokeWidth={2} />
                    </button>
                  </div>
                  <button type="button" onClick={() => { setActiveTab("comms"); window.setTimeout(() => { document.getElementById("order-comms-note")?.focus(); }, 0); }} className={`${ORDER_DETAIL_HEADER_ICON_BTN} ${order?.has_customer_comment ? "border-emerald-300 bg-emerald-50 text-emerald-700 relative" : "relative"}`}>
                    <Mail className="h-4 w-4 shrink-0" strokeWidth={2} />
                    {order?.has_customer_comment && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}
                  </button>
                  <div className="w-px h-6 bg-slate-200 mx-1"></div>
                  <OrderDocumentsPrintMenu
                    orderId={order.id}
                    linkedDocuments={order.linked_documents}
                    panelDocumentType={order.panel_document_type}
                    salesDocumentNumber={order.sales_document_number}
                    onPrint={requestOrderDocumentPrint}
                    busy={orderDocumentPrintBusy}
                    compact
                  />
                  {!isStationarySale ? (
                    <Link to={WMS_ROUTES.packingOrder(order.id)} className={brandPrimaryButtonClass}>Spakuj</Link>
                  ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-slate-100 pb-2 pt-4">
              <OrderDetailProcessStatusRow
                statusGroupLabel={
                  order.order_ui_status?.main_group
                    ? ORDERS_PANEL_GROUP_LABELS[order.order_ui_status.main_group]
                    : null
                }
                statusControl={
                  <div className="flex min-w-max shrink-0 items-center">
                    {orderFulfillmentWhId != null ? (
                      <OrderDetailPrimaryStatusDropdown
                        variant="compact"
                        currentStatus={order.order_ui_status ?? null}
                        panelSummary={panelSummary}
                        panelSubgroups={panelSubgroups}
                        saving={panelSaving}
                        onSelectStatus={async (subStatusId) => {
                          setPanelSaving(true);
                          try {
                            const updated = await patchOrderUiStatus(
                              order.id,
                              DAMAGE_TENANT_ID,
                              orderFulfillmentWhId,
                              subStatusId,
                            );
                            setOrder((prev) =>
                              prev ? { ...prev, order_ui_status: updated.order_ui_status ?? null } : prev,
                            );
                            await loadPanelSummary();
                          } finally {
                            setPanelSaving(false);
                          }
                        }}
                      />
                    ) : panelOrderStatusBrief ? (
                      <OrderUiStatusConfigRowPresent status={panelOrderStatusBrief} variant="compact" />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                }
                processTitle={
                  wmsDualWorkflow &&
                  wmsDualWorkflow.total > 0 &&
                  wmsDualWorkflow.packed >= wmsDualWorkflow.total
                    ? "Spakowane"
                    : wmsDualWorkflow &&
                        wmsDualWorkflow.total > 0 &&
                        wmsDualWorkflow.pickedSum >= wmsDualWorkflow.total
                      ? "Gotowe do pakowania"
                      : wmsDualWorkflow && wmsDualWorkflow.pickedSum > 0
                        ? `W zbieraniu (${wmsDualWorkflow.pickedSum}/${wmsDualWorkflow.total})`
                        : shippingLabel !== "—"
                          ? shippingLabel
                          : "Oczekuje na realizację"
                }
                processSubtitle={dateLine !== "—" ? dateLine : null}
                hasProgress={Boolean(wmsDualWorkflow && wmsDualWorkflow.total > 0)}
                pickDone={Boolean(
                  wmsDualWorkflow &&
                    wmsDualWorkflow.total > 0 &&
                    wmsDualWorkflow.pickedSum >= wmsDualWorkflow.total,
                )}
                packDone={Boolean(
                  wmsDualWorkflow &&
                    wmsDualWorkflow.total > 0 &&
                    wmsDualWorkflow.packed >= wmsDualWorkflow.total,
                )}
              />
            </div>

            <div className="mt-2 border-b border-slate-200">
              <div className="flex gap-8 overflow-x-auto" role="tablist" aria-label="Sekcje zamówienia">
                {DETAIL_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={tabsNavItemClassName(activeTab === t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
        </div>
    </div>
  );
}
