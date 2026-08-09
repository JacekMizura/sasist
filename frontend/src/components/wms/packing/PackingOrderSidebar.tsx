import type { WmsOperationalNoteBriefApi, WmsPackingOrderDetailApi } from "../../../api/wmsPackingApi";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import type { PackingAutomationButtonsPosition, PackingSalesDocPreview } from "../../../types/wmsPackingExtendedUi";
import { CourierBadge } from "./CourierBadge";
import { PackingAutomationActivators } from "./PackingAutomationActivators";
import { packingCourierLabelCount, packingCourierName } from "./packingHelpers";
import { PackingPackAllIconButton } from "./PackingHeaderChrome";

const NOTES_RED = "#d32f2f";
const DOC_GREEN = "#2e7d32";

function IconPhoneSmall() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-600" aria-hidden>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function IconDots() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

export type PackingOrderSidebarProps = {
  detail: WmsPackingOrderDetailApi;
  /** `simplified` = bez kupującego/adresu; `full` = blok KUPUJĄCY. */
  salesDocumentPreview: PackingSalesDocPreview;
  /** Gdy true — komentarz jest w bannerze; nie powtarzaj w sidebarze. */
  commentInBanner: boolean;
  showOrderPhone?: boolean;
  showOrderValue?: boolean;
  showShippingAddress?: boolean;
  scanBusy: boolean;
  packingActionsLocked: boolean;
  visibleOperationalNotes: WmsOperationalNoteBriefApi[];
  packAll: () => void | Promise<void>;
  onInterrupt: () => void;
  showAutomationButtons?: boolean;
  automationButtonsPosition?: PackingAutomationButtonsPosition;
  warehouseId?: number | null;
  onAutomationToast?: (message: string) => void;
  onAutomationStatusChanged?: () => void;
};

/**
 * Lewy panel dokumentu / przesyłki — bez logistyki wózka i bez Smart Matching.
 */
export function PackingOrderSidebar({
  detail,
  salesDocumentPreview,
  commentInBanner,
  showOrderPhone = true,
  showOrderValue = true,
  showShippingAddress = true,
  scanBusy,
  packingActionsLocked,
  visibleOperationalNotes,
  packAll,
  onInterrupt,
  showAutomationButtons = false,
  automationButtonsPosition = "bottom",
  warehouseId = null,
  onAutomationToast,
  onAutomationStatusChanged,
}: PackingOrderSidebarProps) {
  const detailed = salesDocumentPreview === "full";
  const salesLabel = (detail.sales_document_label ?? "").trim();
  const hasSalesDocument = !!salesLabel;
  const docPrefixUpper = ((detail.document_prefix ?? "Pa") as string).trim().toUpperCase();
  const documentTypeLabel = docPrefixUpper === "FA" ? "Faktura" : "Paragon";
  const uwagiKlienta = (detail.customer_comment ?? "").trim();
  const notatkiMag = (detail.staff_notes ?? "").trim();
  const clientName = (detail.customer_name ?? "").trim();
  const nip = (detail.customer_nip ?? "").trim();
  const address = (detail.shipping_address ?? "").trim();
  const showAddress = showShippingAddress && !!address;
  const telefon = (detail.customer_phone ?? "").trim() || "—";
  const telHref = telefon !== "—" ? telefon.replace(/\s/g, "") : "";
  const showPhone = showOrderPhone && telefon !== "—";
  const orderValueDisplay = (detail.order_value_display ?? "").trim();
  const shippingFee = (detail.shipping_fee_display ?? "").trim();
  const showValue = showOrderValue && !!orderValueDisplay;
  const paymentText = (detail.payment_method_text ?? detail.payment_label ?? "").trim();
  const paymentMethodLower = paymentText.toLowerCase();
  const isCashOnDelivery =
    paymentMethodLower.includes("pobran") ||
    paymentMethodLower.includes("cash on delivery") ||
    paymentMethodLower.includes("cod");
  const shipName =
    (detail.shipping_method_name ?? detail.shipping_method ?? "").trim() || "—";
  const waybillN = packingCourierLabelCount(detail);
  const showSidebarComment = !commentInBanner && !!uwagiKlienta;

  return (
    <aside
      className="flex w-full shrink-0 flex-col border border-slate-200 bg-white lg:max-h-full lg:w-[280px] lg:min-w-[280px] lg:max-w-[280px] lg:self-start lg:overflow-y-auto lg:rounded-xl lg:border"
      aria-label="Dokument i przesyłka"
    >
      <div className="flex flex-col gap-3 p-3 pb-3">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          aria-label="Menu"
        >
          <IconMenu />
        </button>

        <div className="min-w-0">
          {hasSalesDocument ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded px-1.5 text-xs font-bold text-white"
                style={{ background: DOC_GREEN }}
              >
                Fa
              </span>
              <span className="text-sm font-bold tabular-nums text-slate-900">{salesLabel}</span>
              <span className="text-xs font-semibold text-slate-500">{documentTypeLabel}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded px-1.5 text-xs font-bold text-white"
                style={{ background: DOC_GREEN }}
              >
                {docPrefixUpper === "FA" ? "Fa" : "Pa"}
              </span>
              <span className="text-sm font-bold text-slate-700">{documentTypeLabel}</span>
              <span className="text-xs font-medium text-slate-400">nie wygenerowano</span>
            </div>
          )}
        </div>

        {detailed && (clientName || nip || showAddress) ? (
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Kupujący</p>
            {clientName && clientName !== "—" ? (
              <p className="mt-1 text-sm font-bold leading-snug text-slate-900">{clientName}</p>
            ) : null}
            {nip ? <p className="mt-0.5 text-xs font-medium text-slate-600">NIP: {nip}</p> : null}
            {showAddress ? (
              <p className="mt-1 whitespace-pre-line text-xs font-medium leading-snug text-slate-600">{address}</p>
            ) : null}
          </div>
        ) : null}

        <div className="min-w-0">
          <CourierBadge
            variant="sidebar"
            courierName={packingCourierName(detail)}
            labelCount={waybillN}
            logoUrl={detail.shipping_method_logo_url}
            methodNameForLogo={detail.shipping_method_name ?? detail.shipping_method}
            showWaybillLine
          />
          <div className="mt-2 space-y-1 text-xs font-medium text-slate-700">
            <p>
              Wysyłka: <span className="font-semibold text-slate-900">{shipName}</span>
            </p>
            {detail.pickup_point != null ? (
              <p>
                Punkt odbioru:{" "}
                <span className="font-semibold text-slate-900">{detail.pickup_point ? "Tak" : "Nie"}</span>
              </p>
            ) : null}
          </div>
        </div>

        {paymentText || showPhone || showValue ? (
          <div className="min-w-0 space-y-1.5">
            {paymentText ? (
              <p className="text-xs font-medium text-slate-700">
                Płatność: <span className="font-semibold text-slate-900">{paymentText}</span>
              </p>
            ) : null}
            {showPhone ? (
              <p className="inline-flex flex-wrap items-center gap-1.5 text-sm font-bold tabular-nums text-slate-900">
                <IconPhoneSmall />
                <a href={`tel:${telHref}`} className="hover:underline">
                  {telefon}
                </a>
              </p>
            ) : null}
            {showValue ? (
              <p className="text-xs font-medium text-slate-700">
                {isCashOnDelivery ? "Pobranie" : "Wartość"}:{" "}
                <span className="font-bold tabular-nums text-slate-900">
                  {orderValueDisplay}
                  {shippingFee ? ` ${shippingFee}` : ""}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}

        {showSidebarComment ? (
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Uwagi klienta do zamówienia
            </p>
            <p className="mt-1 text-sm font-medium leading-snug text-slate-800">{uwagiKlienta}</p>
          </div>
        ) : null}

        {notatkiMag ? (
          <div className="rounded-lg px-3 py-2.5 text-white shadow-sm" style={{ background: NOTES_RED }}>
            <p className="text-xs font-bold uppercase tracking-wide">Notatki magazynu</p>
            <p className="mt-1 text-sm font-medium leading-snug">{notatkiMag}</p>
          </div>
        ) : null}
        {visibleOperationalNotes.length > 0 ? (
          <div className="space-y-2">
            {visibleOperationalNotes.map((n) => (
              <div
                key={n.id}
                className="rounded-lg px-3 py-2.5 text-white shadow-sm"
                style={{ background: NOTES_RED }}
              >
                <p className="text-xs font-bold uppercase tracking-wide">Notatka</p>
                <p className="mt-1 text-sm font-medium leading-snug">{(n.content ?? "").trim()}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex shrink-0 flex-col gap-2 p-3">
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Opcje"
          >
            <IconDots />
          </button>
          <PackingPackAllIconButton
            size="lg"
            disabled={scanBusy || packingActionsLocked}
            onClick={() => void packAll()}
          />
        </div>
        <button
          type="button"
          className="min-h-11 w-full rounded-lg border-2 border-slate-400 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50"
          onClick={onInterrupt}
        >
          Przerwij
        </button>
        {showAutomationButtons &&
        warehouseId != null &&
        warehouseId > 0 &&
        (automationButtonsPosition === "bottom" || automationButtonsPosition === "right") ? (
          <div className="mt-2">
            <PackingAutomationActivators
              tenantId={DAMAGE_TENANT_ID}
              warehouseId={warehouseId}
              orderId={detail.order_id}
              showAutomationButtons={showAutomationButtons}
              position={automationButtonsPosition}
              onToast={onAutomationToast}
              onStatusChanged={onAutomationStatusChanged}
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
