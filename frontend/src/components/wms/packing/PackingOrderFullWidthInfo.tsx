import type {
  WmsOperationalNoteBriefApi,
  WmsPackingOrderDetailApi,
  WmsPackingRecommendedCartonApi,
} from "../../../api/wmsPackingApi";
import { ShippingMethodLogo } from "../../shipping/ShippingMethodLogo";
import type {
  PackingCustomerCommentStyle,
  PackingSalesDocPreview,
} from "../../../types/wmsPackingExtendedUi";
import { PackingRecommendedCartonsPanel } from "./PackingRecommendedCartons";
import { packingCourierLabelCount, packingCourierName } from "./packingHelpers";

const NOTES_RED = "#d32f2f";
const COMMENT_BG = "#ffebee";
const COMMENT_BORDER = "#ffcdd2";
const COMMENT_TEXT = "#c62828";
const DOC_GREEN = "#2e7d32";

function IconPhoneSmall() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-600" aria-hidden>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

export type PackingOrderFullWidthInfoProps = {
  detail: WmsPackingOrderDetailApi;
  customerCommentStyle: PackingCustomerCommentStyle;
  salesDocumentPreview: PackingSalesDocPreview;
  showOrderPhone?: boolean;
  showOrderValue?: boolean;
  showShippingAddress?: boolean;
  visibleOperationalNotes: WmsOperationalNoteBriefApi[];
  headerCartons: WmsPackingRecommendedCartonApi[];
  selectedCartonId: string | null | undefined;
  selectCartonBusy: boolean;
  packingActionsLocked: boolean;
  onSelectCarton: (cartonId: string, opts?: { confirmOverride?: boolean }) => void;
};

/**
 * Pas informacji zamówienia pod belką — układ „Pełna szerokość” (specyfikacja mocka).
 * Horyzontalny pasek na całą szerokość: dokument → logo → wysyłka → uwagi → opakowania.
 */
export function PackingOrderFullWidthInfo({
  detail,
  customerCommentStyle,
  salesDocumentPreview,
  showOrderPhone = true,
  showOrderValue = true,
  showShippingAddress = true,
  visibleOperationalNotes,
  headerCartons,
  selectedCartonId,
  selectCartonBusy,
  packingActionsLocked,
  onSelectCarton,
}: PackingOrderFullWidthInfoProps) {
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
  const courierName = packingCourierName(detail);
  const forLogo = (detail.shipping_method_name ?? detail.shipping_method ?? courierName ?? "").trim() || null;
  const highlighted = customerCommentStyle === "highlighted";
  const showBuyer = detailed && (clientName || nip || showAddress);

  return (
    <div className="w-full shrink-0 border-b border-slate-200 bg-white" aria-label="Informacje o zamówieniu">
      <div className="flex w-full flex-wrap items-stretch gap-x-5 gap-y-3 px-3 py-3 sm:px-4 lg:px-5">
        {/* Dokument */}
        <div className="flex min-w-0 shrink-0 flex-col justify-center gap-1">
          {hasSalesDocument ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded px-1.5 text-xs font-bold text-white"
                style={{ background: DOC_GREEN }}
              >
                {docPrefixUpper === "FA" ? "Fa" : "Pa"}
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
          {showBuyer ? (
            <div className="min-w-0 max-w-[14rem]">
              {clientName && clientName !== "—" ? (
                <p className="truncate text-xs font-bold text-slate-900">{clientName}</p>
              ) : null}
              {nip ? <p className="text-[11px] font-medium text-slate-600">NIP: {nip}</p> : null}
            </div>
          ) : null}
        </div>

        {/* Logo kuriera — bez tła / boxa */}
        <div className="flex shrink-0 items-center self-center">
          <ShippingMethodLogo
            logoUrl={detail.shipping_method_logo_url}
            methodName={forLogo}
            size="packingSidebar"
            className="!self-center"
          />
        </div>

        {/* Wysyłka / kontakt / wartość — 2 kolumny tekstu */}
        <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-1 text-xs font-medium text-slate-700 sm:grid-cols-2 sm:text-sm">
          <div className="space-y-1">
            {waybillN >= 1 ? (
              <p className="font-semibold text-slate-800">{Math.max(1, waybillN)}x List przewozowy</p>
            ) : null}
            <p>
              Wysyłka: <span className="font-semibold text-slate-900">{shipName}</span>
            </p>
            {detail.pickup_point != null ? (
              <p>
                Punkt odbioru:{" "}
                <span className="font-semibold text-slate-900">{detail.pickup_point ? "Tak" : "Nie"}</span>
              </p>
            ) : null}
            {showAddress ? (
              <p className="max-w-xs whitespace-pre-line text-xs leading-snug text-slate-600">{address}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            {showPhone ? (
              <p className="inline-flex flex-wrap items-center gap-1.5 text-sm font-bold tabular-nums text-slate-900">
                <IconPhoneSmall />
                <a href={`tel:${telHref}`} className="hover:underline">
                  {telefon}
                </a>
              </p>
            ) : null}
            {paymentText ? (
              <p>
                Płatność: <span className="font-semibold text-slate-900">{paymentText}</span>
              </p>
            ) : null}
            {showValue ? (
              <p>
                {isCashOnDelivery ? "Pobranie" : "Wartość"}:{" "}
                <span className="font-bold tabular-nums text-slate-900">
                  {orderValueDisplay}
                  {shippingFee ? ` ${shippingFee}` : ""}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        {/* Notatki + uwagi klienta — rozciągają się na pozostałą szerokość */}
        <div className="flex min-w-[16rem] flex-1 flex-wrap items-stretch gap-3">
          {notatkiMag ? (
            <div
              className="min-w-[14rem] flex-1 rounded-lg px-3 py-2.5 text-white shadow-sm"
              style={{ background: NOTES_RED }}
            >
              <p className="text-xs font-bold uppercase tracking-wide">Notatki magazynu</p>
              <p className="mt-1 text-sm font-medium leading-snug">{notatkiMag}</p>
            </div>
          ) : null}
          {visibleOperationalNotes.map((n) => (
            <div
              key={n.id}
              className="min-w-[14rem] flex-1 rounded-lg px-3 py-2.5 text-white shadow-sm"
              style={{ background: NOTES_RED }}
            >
              <p className="text-xs font-bold uppercase tracking-wide">Notatka</p>
              <p className="mt-1 text-sm font-medium leading-snug">{(n.content ?? "").trim()}</p>
            </div>
          ))}
          {uwagiKlienta ? (
            highlighted ? (
              <div
                className="min-w-[14rem] flex-1 rounded-lg border px-3 py-2.5"
                style={{ background: COMMENT_BG, borderColor: COMMENT_BORDER }}
                role="status"
              >
                <p className="text-xs font-extrabold uppercase tracking-wide" style={{ color: COMMENT_TEXT }}>
                  Uwagi do zamówienia
                </p>
                <p className="mt-1 text-sm font-semibold leading-snug text-red-900">{uwagiKlienta}</p>
              </div>
            ) : (
              <div className="min-w-[14rem] flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Uwagi do zamówienia
                </p>
                <p className="mt-1 text-sm font-medium leading-snug text-slate-800">{uwagiKlienta}</p>
              </div>
            )
          ) : null}
        </div>
      </div>

      {headerCartons.length > 0 ? (
        <div className="w-full border-t border-slate-100 px-3 py-2.5 sm:px-4 lg:px-5">
          <PackingRecommendedCartonsPanel
            items={headerCartons}
            selectedId={selectedCartonId ?? detail.selected_carton_id}
            busy={selectCartonBusy || packingActionsLocked}
            onSelect={onSelectCarton}
            align="start"
          />
        </div>
      ) : null}
    </div>
  );
}
