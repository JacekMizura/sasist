import type { WmsOperationalNoteBriefApi, WmsPackingOrderDetailApi, WmsPackingRecommendedCartonApi } from "../../../api/wmsPackingApi";
import { ShippingMethodLogo } from "../../shipping/ShippingMethodLogo";
import type { PackingCustomerCommentStyle } from "../../../types/wmsPackingExtendedUi";
import { PackingRecommendedCartonsPanel } from "./PackingRecommendedCartons";
import { packingCourierLabelCount, packingCourierName } from "./packingHelpers";

const NOTES_RED = "#d32f2f";
const COMMENT_BG = "#ffebee";
const COMMENT_BORDER = "#ffcdd2";
const COMMENT_TEXT = "#c62828";

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
  visibleOperationalNotes: WmsOperationalNoteBriefApi[];
  headerCartons: WmsPackingRecommendedCartonApi[];
  selectedCartonId: string | null | undefined;
  selectCartonBusy: boolean;
  packingActionsLocked: boolean;
  onSelectCarton: (cartonId: string, opts?: { confirmOverride?: boolean }) => void;
};

/**
 * Pas informacji zamówienia pod belką — układ „Pełna szerokość” (bez lewego sidebara).
 */
export function PackingOrderFullWidthInfo({
  detail,
  customerCommentStyle,
  visibleOperationalNotes,
  headerCartons,
  selectedCartonId,
  selectCartonBusy,
  packingActionsLocked,
  onSelectCarton,
}: PackingOrderFullWidthInfoProps) {
  const uwagiKlienta = (detail.customer_comment ?? "").trim();
  const notatkiMag = (detail.staff_notes ?? "").trim();
  const telefon = (detail.customer_phone ?? "").trim() || "—";
  const telHref = telefon !== "—" ? telefon.replace(/\s/g, "") : "";
  const orderValueDisplay = (detail.order_value_display ?? "").trim();
  const shippingFee = (detail.shipping_fee_display ?? "").trim();
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

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-3 sm:px-4" aria-label="Informacje o zamówieniu">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-start gap-4">
          <ShippingMethodLogo
            logoUrl={detail.shipping_method_logo_url}
            methodName={forLogo}
            size="packingSidebar"
            className="self-start"
          />
          <div className="min-w-0 space-y-1 text-xs font-medium text-slate-700 sm:text-sm">
            {waybillN >= 1 ? (
              <p className="font-semibold text-slate-800">
                {Math.max(1, waybillN)}x List przewozowy
              </p>
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
            {telefon !== "—" ? (
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
            {orderValueDisplay ? (
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

        <div className="flex min-w-0 flex-1 flex-wrap items-stretch justify-end gap-3">
          {notatkiMag ? (
            <div
              className="min-w-[12rem] max-w-md flex-1 rounded-lg px-3 py-2.5 text-white shadow-sm"
              style={{ background: NOTES_RED }}
            >
              <p className="text-xs font-bold uppercase tracking-wide">Notatki magazynu</p>
              <p className="mt-1 text-sm font-medium leading-snug">{notatkiMag}</p>
            </div>
          ) : null}
          {visibleOperationalNotes.map((n) => (
            <div
              key={n.id}
              className="min-w-[12rem] max-w-md flex-1 rounded-lg px-3 py-2.5 text-white shadow-sm"
              style={{ background: NOTES_RED }}
            >
              <p className="text-xs font-bold uppercase tracking-wide">Notatka</p>
              <p className="mt-1 text-sm font-medium leading-snug">{(n.content ?? "").trim()}</p>
            </div>
          ))}
          {uwagiKlienta ? (
            highlighted ? (
              <div
                className="min-w-[12rem] max-w-lg flex-1 rounded-lg border px-3 py-2.5"
                style={{ background: COMMENT_BG, borderColor: COMMENT_BORDER }}
                role="status"
              >
                <p className="text-xs font-extrabold uppercase tracking-wide" style={{ color: COMMENT_TEXT }}>
                  Uwagi do zamówienia
                </p>
                <p className="mt-1 text-sm font-semibold leading-snug text-red-900">{uwagiKlienta}</p>
              </div>
            ) : (
              <div className="min-w-[12rem] max-w-lg flex-1">
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
        <div className="mt-3">
          <PackingRecommendedCartonsPanel
            items={headerCartons}
            selectedId={selectedCartonId ?? detail.selected_carton_id}
            busy={selectCartonBusy || packingActionsLocked}
            onSelect={onSelectCarton}
          />
        </div>
      ) : null}
    </div>
  );
}
