import type { Dispatch, SetStateAction } from "react";
import { Link } from "react-router-dom";
import { Mail, Pencil, Phone, Plus, Printer, RefreshCw, Send, Shield, Truck } from "lucide-react";

import { OrderDetailInfoColumn } from "./OrderDetailInfoColumn";
import { OrderDetailSectionCard } from "./OrderDetailSectionCard";
import { OrderDetailSummaryCompactRow } from "./OrderDetailSummaryCompactRow";
import { OrderCustomerLinkPanel } from "../customers/OrderCustomerLinkPanel";
import { OrderMatchedPackagingSection } from "./OrderMatchedPackagingSection";
import OrderAdditionalFieldsSection from "./OrderAdditionalFieldsSection";
import {
  OrderSummaryProductsList,
  type OrderSummaryLineMenuAction,
  type OrderSummaryProductItem,
  type OrderSummaryProductsListLine,
} from "./OrderSummaryProductsList";
import type { OrderDocTableRow } from "./docs/orderDocTableTypes";
import type { DetailTabId } from "./orderDetailTabs";
import {
  odInlineIconBtnClass,
  odMainMaxWidthClass,
  odPaidBadgeClass,
  odProductsHeroTitleClass,
  odSidePanelQuietTitleClass,
  odSidePanelSectionTitleClass,
  odWmsPhaseChipClass,
} from "./orderDetailUiTokens";
import type {
  OrderDetail,
  OrderDetailDocDraft,
} from "./orderDetailPageTypes";
import { PAYMENT_METHOD_PRESETS, PAYMENT_STATUS_PRESETS } from "./orderDetailPageTypes";
import {
  paymentStatusIsPaid,
  parseBillingInvoice,
  shippingFromOrderJson,
  type BillingInvoiceParsed,
  type ShippingAddrDraft,
  type ShippingExtrasParsed,
} from "../../utils/orderDetailAddress";
import { patchOrder } from "../../api/ordersApi";
import type { WmsOrderTimelineEventApi, WmsPackingOrderCardApi } from "../../api/wmsPackingApi";
import type { DocumentPrintRequest } from "../../utils/documentTemplatePrint";
import { saleKindFromSubtype, stockKindFromType } from "../../utils/documentTemplatePrint";
import { printButtonLabelPl } from "../directSales/directSalesTerminology";
import { formatMoney } from "../../utils/formatOrderMoney";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";
import { DAMAGE_TENANT_ID } from "../../pages/damage/damageShared";
import { WMS_ROUTES } from "../../pages/wms/wmsRoutes";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { displayCustomerComment } from "../../utils/displayCustomerComment";

const inpSm = "mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-900";

function autoGrowTextarea(el: HTMLTextAreaElement, minPx = 52) {
  el.style.height = "auto";
  el.style.height = `${Math.max(el.scrollHeight, minPx)}px`;
}

type ContactInfo = { name: string; phone: string; email: string; addressLines: string[] };

type Props = {
  order: OrderDetail;
  contact: ContactInfo;
  setEditBuyerModalOpen: Dispatch<SetStateAction<boolean>>;
  orderHasUnlinkedCustomerData: boolean;
  reloadOrderById: (oid: number) => Promise<void>;
  loadWmsFulfillment: () => Promise<void>;
  payMethodDraft: string;
  setPayMethodDraft: Dispatch<SetStateAction<string>>;
  payStatusDraft: string;
  setPayStatusDraft: Dispatch<SetStateAction<string>>;
  isStationarySale: boolean;
  shipDraft: string;
  setShipDraft: Dispatch<SetStateAction<string>>;
  orderFulfillmentWhId: number | null;
  shippingMethods: { id: string; name: string; is_active: boolean }[];
  shipPaySaving: boolean;
  setShipPaySaving: Dispatch<SetStateAction<boolean>>;
  addressEditing: boolean;
  setAddressEditing: Dispatch<SetStateAction<boolean>>;
  addrDraft: ShippingAddrDraft;
  setAddrDraft: Dispatch<SetStateAction<ShippingAddrDraft>>;
  addressSaving: boolean;
  setAddressSaving: Dispatch<SetStateAction<boolean>>;
  summaryShippingName: string;
  shippingExtras: ShippingExtrasParsed | null;
  summaryDocEditing: boolean;
  setSummaryDocEditing: Dispatch<SetStateAction<boolean>>;
  docDraft: OrderDetailDocDraft;
  setDocDraft: Dispatch<SetStateAction<OrderDetailDocDraft>>;
  panelDocumentLabel: string;
  docSaving: boolean;
  setDocSaving: Dispatch<SetStateAction<boolean>>;
  billingInvoice: BillingInvoiceParsed | null;
  requestOrderDocumentPrint: (req: DocumentPrintRequest, opts?: { autoPrint?: boolean }) => Promise<void>;
  summaryProductsLines: OrderSummaryProductsListLine[];
  handleOrderLineMenuAction: (action: OrderSummaryLineMenuAction, item: OrderSummaryProductItem) => void;
  wmsLoading: boolean;
  wmsFulfillment: WmsPackingOrderCardApi | null;
  docsTabWaybillsRows: OrderDocTableRow[];
  setActiveTab: Dispatch<SetStateAction<DetailTabId>>;
  onAddProduct: () => void;
  onAddBundle: () => void;
  formatDetailDate: (iso: string | null | undefined) => string;
  opDraft: string;
  setOpDraft: Dispatch<SetStateAction<string>>;
  opVisPick: boolean;
  setOpVisPick: Dispatch<SetStateAction<boolean>>;
  opVisPack: boolean;
  setOpVisPack: Dispatch<SetStateAction<boolean>>;
  opSaving: boolean;
  saveOperationalNote: () => Promise<void>;
  noteDraft: string;
  setNoteDraft: Dispatch<SetStateAction<string>>;
  linesTotalDisplay: string;
  orderRabatMode: "pct" | "pln";
  setOrderRabatMode: Dispatch<SetStateAction<"pct" | "pln">>;
  orderRabatDraft: string;
  setOrderRabatDraft: Dispatch<SetStateAction<string>>;
  orderRabatSaving: boolean;
  saveOrderDiscount: () => Promise<void>;
  productsAfterDiscount: number | null;
  marginTone: string;
  timelinePickEvt: WmsOrderTimelineEventApi | undefined;
  timelinePackEvt: WmsOrderTimelineEventApi | undefined;
};

/**
 * "Podsumowanie" tab body of the order-detail page.
 * Moved from OrderDetailPage.tsx — exact JSX, no visual/logic changes.
 * `SummaryDashboardCard` → `OrderDetailSectionCard`, `SummaryCompactRow` → `OrderDetailSummaryCompactRow` (identical shell).
 */
export function OrderDetailSummaryTab({
  order,
  contact,
  setEditBuyerModalOpen,
  orderHasUnlinkedCustomerData,
  reloadOrderById,
  loadWmsFulfillment,
  payMethodDraft,
  setPayMethodDraft,
  payStatusDraft,
  setPayStatusDraft,
  isStationarySale,
  shipDraft,
  setShipDraft,
  orderFulfillmentWhId,
  shippingMethods,
  shipPaySaving,
  setShipPaySaving,
  addressEditing,
  setAddressEditing,
  addrDraft,
  setAddrDraft,
  addressSaving,
  setAddressSaving,
  summaryShippingName,
  shippingExtras,
  summaryDocEditing,
  setSummaryDocEditing,
  docDraft,
  setDocDraft,
  panelDocumentLabel,
  docSaving,
  setDocSaving,
  billingInvoice,
  requestOrderDocumentPrint,
  summaryProductsLines,
  handleOrderLineMenuAction,
  wmsLoading,
  wmsFulfillment,
  docsTabWaybillsRows,
  setActiveTab,
  onAddProduct,
  onAddBundle,
  formatDetailDate,
  opDraft,
  setOpDraft,
  opVisPick,
  setOpVisPick,
  opVisPack,
  setOpVisPack,
  opSaving,
  saveOperationalNote,
  noteDraft,
  setNoteDraft,
  linesTotalDisplay,
  orderRabatMode,
  setOrderRabatMode,
  orderRabatDraft,
  setOrderRabatDraft,
  orderRabatSaving,
  saveOrderDiscount,
  productsAfterDiscount,
  marginTone,
  timelinePickEvt,
  timelinePackEvt,
}: Props) {
  const shipPayDirty =
    orderFulfillmentWhId != null &&
    (shipDraft.trim() !== (order.shipping_method_id ?? "").trim() ||
      payMethodDraft.trim() !== (order.panel_payment_method ?? "").trim() ||
      payStatusDraft.trim() !== (order.panel_payment_status ?? "").trim());

  return (
    <div className={odMainMaxWidthClass}>
      {/* —— 1. KONTEKST ZAMÓWIENIA (zwarty pas) —— */}
      <div className="mb-4 border-b border-slate-200 pb-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        <OrderDetailInfoColumn
          title="Kupujący"
          actions={
            <button
              type="button"
              onClick={() => setEditBuyerModalOpen(true)}
              className={odInlineIconBtnClass}
              aria-label="Edytuj kupującego"
            >
              <Pencil className="h-4 w-4" strokeWidth={2} />
            </button>
          }
        >
          <p className="font-semibold text-slate-900">{contact.name}</p>
          {order.customer ? (
            <Link to={`/customers/${order.customer.id}`} className="text-blue-700 font-medium hover:underline">
              {getCustomerDisplayName(order.customer)}
            </Link>
          ) : null}
          <OrderCustomerLinkPanel
            orderId={order.id}
            tenantId={order.tenant_id ?? DAMAGE_TENANT_ID}
            customerId={order.customer_id ?? order.customer?.id}
            hasContactData={orderHasUnlinkedCustomerData}
            onLinked={() => void reloadOrderById(order.id)}
          />
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5">
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <Phone size={14} className="shrink-0 text-slate-400" /> {contact.phone}
            </span>
            {contact.phone !== "—" ? (
              <a href={`tel:${contact.phone}`} className={odInlineIconBtnClass} aria-label="Zadzwoń">
                <Phone className="h-3.5 w-3.5" strokeWidth={2} />
              </a>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <Mail size={14} className="shrink-0 text-slate-400" /> <span className="truncate">{contact.email}</span>
            </span>
            {contact.email !== "—" ? (
              <a href={`mailto:${contact.email}`} className={odInlineIconBtnClass} aria-label="Wyślij e-mail">
                <Mail className="h-3.5 w-3.5" strokeWidth={2} />
              </a>
            ) : null}
          </div>
        </OrderDetailInfoColumn>

        <OrderDetailInfoColumn
          title="Dostawa i płatność"
          actions={
            <button
              type="button"
              className="text-slate-400 hover:text-slate-800"
              onClick={() => { void reloadOrderById(order.id); void loadWmsFulfillment(); }}
            >
              <RefreshCw className="h-4 w-4" strokeWidth={2} />
            </button>
          }
        >
          <OrderDetailSummaryCompactRow label="Metoda płatności" value={<select className={inpSm} value={payMethodDraft} onChange={(e) => setPayMethodDraft(e.target.value)}><option value="">—</option>{Array.from(new Set([...PAYMENT_METHOD_PRESETS, payMethodDraft].filter(Boolean))).map((m) => (<option key={m} value={m}>{m}</option>))}</select>} />
          <div className="flex items-center justify-between border-b border-slate-100 py-1.5 text-[13px]">
            <span className="font-medium text-slate-500">Status płatności</span>
            <select className={`rounded-md border px-2 py-0.5 text-xs font-bold outline-none ${paymentStatusIsPaid(payStatusDraft) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white"}`} value={payStatusDraft} onChange={(e) => setPayStatusDraft(e.target.value)}><option value="">—</option>{Array.from(new Set([...PAYMENT_STATUS_PRESETS, payStatusDraft].filter(Boolean))).map((m) => (<option key={m} value={m}>{m}</option>))}</select>
          </div>
          {!isStationarySale ? (
            <label className="flex flex-col gap-1 border-b border-slate-100 py-1.5 text-[13px] font-medium text-slate-500 last:border-b-0">
              <span className="flex items-center gap-2"><Truck className="h-4 w-4" /> Sposób wysyłki</span>
              <select className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px] font-bold text-orange-600 outline-none focus:border-orange-500" value={shipDraft} disabled={orderFulfillmentWhId == null} onChange={(e) => setShipDraft(e.target.value)}><option value="">— brak —</option>{shippingMethods.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}</select>
            </label>
          ) : (
            <OrderDetailSummaryCompactRow label="Odbiór" value={order.shipping_method ?? "Odbiór osobisty"} />
          )}
          {shipPayDirty ? (
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50" onClick={() => { setShipDraft(order.shipping_method_id?.trim() ?? ""); setPayMethodDraft((order.panel_payment_method ?? "").trim()); setPayStatusDraft((order.panel_payment_status ?? "").trim()); }}>Anuluj</button>
              <button type="button" disabled={shipPaySaving} onClick={() => { setShipPaySaving(true); void patchOrder(order.id, { shipping_method_id: shipDraft.trim() || null, payment_method: payMethodDraft.trim() || null, payment_status: payStatusDraft.trim() || null }).then(() => reloadOrderById(order.id)).finally(() => setShipPaySaving(false)); }} className={brandPrimaryButtonClass}>{shipPaySaving ? "..." : "Zapisz"}</button>
            </div>
          ) : null}
        </OrderDetailInfoColumn>

        <OrderDetailInfoColumn
          title="Adres dostawy"
          actions={orderFulfillmentWhId != null && !addressEditing ? (
            <button onClick={() => { setAddrDraft(shippingFromOrderJson(order.addresses_json)); setAddressEditing(true); }} className={odInlineIconBtnClass} aria-label="Edytuj adres dostawy">
              <Pencil className="h-4 w-4" strokeWidth={2} />
            </button>
          ) : null}
        >
          {addressEditing ? (
            <div className="space-y-2 text-sm font-medium">
              <label className="flex flex-col text-slate-600">Imię i nazwisko<input className={inpSm} value={addrDraft.name} onChange={(e) => setAddrDraft((d) => ({ ...d, name: e.target.value }))} /></label>
              <label className="flex flex-col text-slate-600">Ulica<input className={inpSm} value={addrDraft.street} onChange={(e) => setAddrDraft((d) => ({ ...d, street: e.target.value }))} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col text-slate-600">Kod<input className={inpSm} value={addrDraft.postal} onChange={(e) => setAddrDraft((d) => ({ ...d, postal: e.target.value }))} /></label>
                <label className="flex flex-col text-slate-600">Miasto<input className={inpSm} value={addrDraft.city} onChange={(e) => setAddrDraft((d) => ({ ...d, city: e.target.value }))} /></label>
              </div>
              <label className="flex flex-col text-slate-600">Kraj<input className={inpSm} value={addrDraft.country} onChange={(e) => setAddrDraft((d) => ({ ...d, country: e.target.value }))} /></label>
              <div className="flex justify-end gap-2 pt-3">
                <button className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50" onClick={() => { setAddrDraft(shippingFromOrderJson(order.addresses_json)); setAddressEditing(false); }}>Anuluj</button>
                <button disabled={addressSaving || orderFulfillmentWhId == null} className={brandPrimaryButtonClass} onClick={() => { setAddressSaving(true); void patchOrder(order.id, { shipping_name: addrDraft.name.trim() || null, shipping_street: addrDraft.street.trim() || null, shipping_city: addrDraft.city.trim() || null, shipping_postal_code: addrDraft.postal.trim() || null, shipping_country: addrDraft.country.trim() || null }).then(() => reloadOrderById(order.id)).finally(() => { setAddressSaving(false); setAddressEditing(false); }); }}>{addressSaving ? "..." : "Zapisz"}</button>
              </div>
            </div>
          ) : (
            <div className="space-y-1 text-[13px] text-slate-700">
              <p className="font-semibold text-slate-900">{summaryShippingName}</p>
              {shippingExtras?.company && <p className="text-slate-600">{shippingExtras.company}</p>}
              <p className="flex items-center text-slate-600"><Phone size={13} className="mr-2 text-slate-400"/> {shippingExtras?.phone || contact.phone}</p>
              <p className="flex items-center border-b border-slate-100 pb-1.5 text-slate-600"><Mail size={13} className="mr-2 text-slate-400"/> <span className="truncate">{shippingExtras?.email || contact.email}</span></p>
              <div className="pt-1">
                {contact.addressLines.length > 0 && contact.addressLines[0] !== "—" ? contact.addressLines.map((ln, i) => <p key={`ship-${i}`}>{ln}</p>) : <p className="text-slate-500">Brak adresu.</p>}
                {shippingExtras?.pickupPoint && <p className="mt-1.5 font-semibold text-slate-700">{shippingExtras.pickupPoint}</p>}
                {shippingExtras?.pickupCode && <p className="text-slate-600">Kod odbioru: {shippingExtras.pickupCode}</p>}
              </div>
            </div>
          )}
        </OrderDetailInfoColumn>

        <OrderDetailInfoColumn
          title={summaryDocEditing ? (docDraft.document_type === "INVOICE" ? "Faktura" : "Paragon") : panelDocumentLabel}
          actions={orderFulfillmentWhId != null && !summaryDocEditing ? (
            <button onClick={() => { const inv = parseBillingInvoice(order.addresses_json); const t = (order.panel_document_type ?? "").trim().toUpperCase(); setDocDraft({ document_type: t === "INVOICE" ? "INVOICE" : "PARAGON", sales_document_number: (order.sales_document_number ?? "").trim(), company_name: inv.companyName, nip: inv.nip, billing_email: inv.email }); setSummaryDocEditing(true); }} className={odInlineIconBtnClass} aria-label="Edytuj dokument sprzedaży">
              <Pencil className="h-4 w-4" strokeWidth={2} />
            </button>
          ) : null}
        >
          {summaryDocEditing ? (
            <div className="space-y-2 text-sm font-medium">
              <label className="flex flex-col text-slate-600">Rodzaj dokumentu<select className={inpSm} value={docDraft.document_type} onChange={(e) => setDocDraft((d) => ({ ...d, document_type: e.target.value === "INVOICE" ? "INVOICE" : "PARAGON" }))}><option value="PARAGON">Paragon</option><option value="INVOICE">Faktura</option></select></label>
              <label className="flex flex-col text-slate-600">Numer dokumentu<input className={inpSm} value={docDraft.sales_document_number} onChange={(e) => setDocDraft((d) => ({ ...d, sales_document_number: e.target.value }))} /></label>
              {docDraft.document_type === "INVOICE" && (
                <>
                  <label className="flex flex-col text-slate-600">Firma<input className={inpSm} value={docDraft.company_name} onChange={(e) => setDocDraft((d) => ({ ...d, company_name: e.target.value }))} /></label>
                  <label className="flex flex-col text-slate-600">NIP<input className={inpSm} value={docDraft.nip} onChange={(e) => setDocDraft((d) => ({ ...d, nip: e.target.value }))} /></label>
                  <label className="flex flex-col text-slate-600">E-mail<input type="email" className={inpSm} value={docDraft.billing_email} onChange={(e) => setDocDraft((d) => ({ ...d, billing_email: e.target.value }))} /></label>
                </>
              )}
              <div className="flex justify-end gap-2 pt-3">
                <button className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50" onClick={() => { const inv = parseBillingInvoice(order.addresses_json); const t = (order.panel_document_type ?? "").trim().toUpperCase(); setDocDraft({ document_type: t === "INVOICE" ? "INVOICE" : "PARAGON", sales_document_number: (order.sales_document_number ?? "").trim(), company_name: inv.companyName, nip: inv.nip, billing_email: inv.email }); setSummaryDocEditing(false); }}>Anuluj</button>
                <button disabled={docSaving || orderFulfillmentWhId == null} className={brandPrimaryButtonClass} onClick={() => { setDocSaving(true); const isInv = docDraft.document_type === "INVOICE"; void patchOrder(order.id, { document_type: docDraft.document_type, sales_document_number: docDraft.sales_document_number.trim() || null, company_name: isInv ? docDraft.company_name.trim() || null : null, nip: isInv ? docDraft.nip.trim() || null : null, email: isInv ? docDraft.billing_email.trim() || null : null }).then(() => reloadOrderById(order.id)).finally(() => { setDocSaving(false); setSummaryDocEditing(false); }); }}>{docSaving ? "..." : "Zapisz"}</button>
              </div>
            </div>
          ) : (
            <>
              <OrderDetailSummaryCompactRow label="Rodzaj" value={panelDocumentLabel} />
              <OrderDetailSummaryCompactRow label="Numer" value={<span className="font-mono text-blue-600 hover:underline cursor-pointer">{(order.sales_document_number ?? "").trim() || "—"}</span>} />
              {(order.panel_document_type ?? "").trim().toUpperCase() === "INVOICE" && billingInvoice && (billingInvoice.companyName || billingInvoice.nip || billingInvoice.email) && (
                <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-[13px] text-slate-700">
                  {billingInvoice.companyName && <p className="font-bold text-slate-900">{billingInvoice.companyName}</p>}
                  {billingInvoice.nip && <p>NIP {billingInvoice.nip}</p>}
                  {billingInvoice.email && <p className="break-all">{billingInvoice.email}</p>}
                  {billingInvoice.streetLine && <p>{billingInvoice.streetLine}</p>}
                  {billingInvoice.cityLine && <p>{billingInvoice.cityLine}</p>}
                </div>
              )}
            </>
          )}
        </OrderDetailInfoColumn>
      </div>
      </div>

      {(order.linked_documents?.length ?? 0) > 0 ? (
        <div className="mb-4">
        <OrderDetailSectionCard title="Powiązane dokumenty" dense>
          <div className="flex flex-wrap gap-2">
            {order.linked_documents!.map((doc) => (
              <button
                key={`${doc.kind}-${doc.id}`}
                type="button"
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => {
                  if (doc.kind === "sale" || doc.sale_document_id) {
                    void requestOrderDocumentPrint({
                      kind: "sale_document",
                      documentId: String(doc.sale_document_id ?? doc.id),
                      kindCode: saleKindFromSubtype(doc.document_subtype ?? doc.document_type),
                    });
                  } else if (doc.stock_document_id != null) {
                    void requestOrderDocumentPrint({
                      kind: "stock_document",
                      documentId: doc.stock_document_id,
                      kindCode: stockKindFromType(doc.document_type),
                    });
                  }
                }}
              >
                <Printer className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                {printButtonLabelPl(doc.print_kind ?? doc.document_subtype ?? doc.document_type)}
                {doc.document_number ? ` ${doc.document_number}` : ""}
              </button>
            ))}
          </div>
        </OrderDetailSectionCard>
        </div>
      ) : null}

      {/* —— 2. PRODUKTY (dominująca część ekranu) —— */}
      <section className="mb-7">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className={odProductsHeroTitleClass}>
            Zamówione produkty
            <span className="ml-2 text-xl font-semibold text-slate-500">({summaryProductsLines.length})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {!isStationarySale ? (
              <Link to={WMS_ROUTES.packingOrder(order.id)} className={brandPrimaryButtonClass}>
                Spakuj
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onAddProduct}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold shadow-sm transition-colors hover:bg-slate-50"
            >
              + Dodaj produkt
            </button>
            <button
              type="button"
              onClick={onAddBundle}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold shadow-sm transition-colors hover:bg-slate-50"
            >
              + Dodaj zestaw
            </button>
          </div>
        </div>
        <div className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white text-sm text-slate-800">
          <OrderSummaryProductsList compact lines={summaryProductsLines} productEditTenantId={order.tenant_id ?? DAMAGE_TENANT_ID} onLineAction={handleOrderLineMenuAction} />
        </div>
      </section>

      {/* —— 3. SEKCJE POMOCNICZE —— */}
      <div className="grid grid-cols-1 gap-5 border-t border-slate-100 pt-5 lg:grid-cols-12 lg:items-start">
        <div className="space-y-4 lg:col-span-8">
          <OrderDetailSectionCard
            dense
            title="Dopasowane opakowanie"
            right={
              <Link to={WMS_ROUTES.packingOrder(order.id)} className="text-slate-400 transition-colors hover:text-slate-800" aria-label="Edytuj opakowanie">
                <Pencil className="h-4 w-4" strokeWidth={2} />
              </Link>
            }
          >
            {wmsLoading ? (
              <p className="text-sm text-slate-500">Ładowanie propozycji...</p>
            ) : (
              <OrderMatchedPackagingSection card={wmsFulfillment} pairRecommendationColumns />
            )}
          </OrderDetailSectionCard>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <OrderDetailSectionCard dense title="Listy przewozowe">
              {docsTabWaybillsRows.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] text-slate-600">
                    Liczba dokumentów: <span className="font-bold text-slate-900">{docsTabWaybillsRows.length}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("docs")}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Zobacz dokumenty
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] text-slate-500">Brak listów przewozowych.</p>
                  <button type="button" onClick={() => setActiveTab("docs")} className={brandPrimaryButtonClass}>
                    Nadaj przesyłkę
                  </button>
                </div>
              )}
            </OrderDetailSectionCard>

            <OrderDetailSectionCard dense title="Wideo WMS">
              <p className="text-[13px] text-slate-500">Brak nagrań.</p>
            </OrderDetailSectionCard>
          </div>

          <section id="order-summary-operational-notes" className="rounded-lg border border-slate-200 bg-white p-3.5">
            <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Notatki</h3>
            <div className="mb-2.5 space-y-1.5">
              {order.operational_notes && order.operational_notes.length > 0 ? (
                order.operational_notes.map((n) => (
                  <div
                    key={n.id}
                    className="-mx-1 rounded-md border border-transparent px-1.5 py-1 transition-colors hover:border-slate-200 hover:bg-slate-50/50"
                  >
                    <p className="mb-0.5 whitespace-pre-wrap text-[13px] text-slate-900">{n.content}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                      <span>{formatDetailDate(n.created_at ?? null)}</span>
                      {n.show_in_picking ? (
                        <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5">WMS Zbieranie</span>
                      ) : null}
                      {n.show_in_packing ? (
                        <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5">WMS Pakowanie</span>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[13px] text-slate-500">Brak notatek operacyjnych.</p>
              )}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
              <textarea
                value={opDraft}
                onChange={(e) => {
                  setOpDraft(e.target.value);
                  autoGrowTextarea(e.target);
                }}
                onFocus={(e) => autoGrowTextarea(e.target)}
                rows={2}
                placeholder="Wpisz treść notatki..."
                className="mb-2 max-h-40 min-h-[3.25rem] w-full resize-none overflow-y-auto rounded-md border border-slate-300 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-3 text-xs text-slate-600">
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                      checked={opVisPick}
                      onChange={(e) => setOpVisPick(e.target.checked)}
                    />
                    WMS zbieranie
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                      checked={opVisPack}
                      onChange={(e) => setOpVisPack(e.target.checked)}
                    />
                    WMS pakowanie
                  </label>
                </div>
                <button
                  type="button"
                  disabled={opSaving || !opDraft.trim()}
                  onClick={() => void saveOperationalNote()}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Zapisz notatkę
                </button>
              </div>
            </div>
          </section>

          <OrderDetailSectionCard dense title="Wiadomość do klienta">
            <div className="mb-2 flex gap-1.5">
              <span className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                ✓ E-mail
              </span>
              <button
                type="button"
                onClick={() => setActiveTab("comms")}
                className="cursor-pointer rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                SMS
              </button>
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={2}
              placeholder="Wpisz treść..."
              className="mb-2 w-full resize-y rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] outline-none transition-colors focus:border-orange-500"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("comms")}
                className="flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                <Plus size={14} className="mr-1.5" /> Dodaj załącznik
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("comms")}
                className={brandPrimaryButtonClass}
              >
                Wyślij <Send size={14} className="ml-1.5" />
              </button>
            </div>
          </OrderDetailSectionCard>
        </div>

        <aside className="overflow-hidden rounded-lg border border-slate-200 bg-white lg:sticky lg:top-3 lg:col-span-4">
          <div className="border-b border-slate-100 px-3.5 py-3">
            <h3 className={`${odSidePanelSectionTitleClass} mb-2`}>Podsumowanie zamówienia</h3>
            {displayCustomerComment(wmsFulfillment?.customer_comment ?? order.latest_customer_comment_preview) ? (
              <div className="mb-2.5 rounded-md border border-[#f5e08b] bg-[#fff9c4] p-2.5 text-xs text-yellow-900">
                <strong>Uwaga:</strong>{" "}
                {displayCustomerComment(wmsFulfillment?.customer_comment ?? order.latest_customer_comment_preview)}
              </div>
            ) : null}
            <div className="space-y-2 text-[13px] text-slate-600">
              <div className="flex items-center justify-between gap-2">
                <span>Źródło</span>
                <span className="font-bold text-slate-900">{(order.source ?? "").trim() || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Wartość produktów</span>
                <span className="font-medium text-slate-800">{linesTotalDisplay}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Koszt dostawy</span>
                <span className="font-medium text-slate-800">
                  {order.panel_shipping_cost != null
                    ? formatMoney(Number(order.panel_shipping_cost), order.currency)
                    : (order.panel_shipping_cost_display ?? "—")}
                </span>
              </div>
              <div className="mt-2 flex items-end justify-between border-t border-slate-100 pt-2.5">
                <span className="font-medium text-slate-700">Razem</span>
                <div className="text-right">
                  <span className="block text-xl font-black text-slate-900">{formatMoney(order.value, order.currency)}</span>
                  {paymentStatusIsPaid(order.panel_payment_status) ? (
                    <span className={`${odPaidBadgeClass} mt-0.5`}>Opłacone</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-100 px-3.5 py-3">
            <h3 className={`${odSidePanelSectionTitleClass} mb-2`}>Rabat i marża</h3>
            <div className="mb-2.5 flex gap-1.5">
              <div className="flex rounded-md bg-slate-100 p-0.5">
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-xs font-bold transition-colors ${orderRabatMode === "pln" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                  onClick={() => setOrderRabatMode("pln")}
                >
                  PLN
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-xs font-bold transition-colors ${orderRabatMode === "pct" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                  onClick={() => setOrderRabatMode("pct")}
                >
                  %
                </button>
              </div>
              <input
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-2.5 py-1 text-[13px] outline-none transition-colors focus:border-orange-500"
                value={orderRabatDraft}
                onChange={(e) => setOrderRabatDraft(e.target.value)}
                placeholder="Rabat"
              />
              <button
                type="button"
                disabled={orderRabatSaving}
                onClick={() => void saveOrderDiscount()}
                className={brandPrimaryButtonClass}
              >
                {orderRabatSaving ? "..." : "Zapisz"}
              </button>
            </div>
            <div className="space-y-1.5 text-[13px] text-slate-600">
              <div className="flex justify-between gap-2">
                <span>Po rabacie</span>
                <span className="font-medium text-slate-900">{formatMoney(productsAfterDiscount, order.currency)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Marża %</span>
                <span className={`font-bold ${marginTone}`}>
                  {order.margin != null && Number.isFinite(Number(order.margin))
                    ? `${Number(order.margin).toFixed(2)}%`
                    : "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-100 px-3.5 py-2.5">
            <h3 className={`${odSidePanelQuietTitleClass} mb-1.5`}>Safe Order</h3>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50">
                <Shield size={16} className="text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-800">Brak sygnałów ryzyka</p>
                <p className="text-[11px] leading-snug text-slate-400">Brak aktywnych oznaczeń fraud.</p>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-100 px-3.5 py-2.5">
            <h3 className={`${odSidePanelQuietTitleClass} mb-1.5`}>Dodatkowe pola</h3>
            <OrderAdditionalFieldsSection
              orderId={order.id}
              documents={order.order_documents ?? []}
              onOrderRefresh={() => void reloadOrderById(order.id)}
              embedded
            />
          </div>

          <div className="px-3.5 py-2.5">
            <h3 className={`${odSidePanelSectionTitleClass} mb-2`}>WMS — operatorzy</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <span className={odWmsPhaseChipClass}>W zbieraniu</span>
                <p className="mt-1.5 text-[13px] font-bold text-slate-900">
                  {(timelinePickEvt?.user_label ?? timelinePickEvt?.title ?? "").trim() || "—"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {timelinePickEvt?.at ? formatDetailDate(timelinePickEvt.at) : "—"}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <span className={odWmsPhaseChipClass}>W pakowaniu</span>
                <p className="mt-1.5 text-[13px] font-bold text-slate-900">
                  {(timelinePackEvt?.user_label ?? timelinePackEvt?.title ?? "").trim() || "—"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {timelinePackEvt?.at ? formatDetailDate(timelinePackEvt.at) : "—"}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[13px] text-slate-600">
              Koszyk / wózek:{" "}
              <span className="font-bold text-slate-900">
                {(wmsFulfillment?.basket_code ?? wmsFulfillment?.wms_vehicle_label ?? "").trim() || "—"}
              </span>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
