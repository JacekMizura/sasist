import { MoreVertical } from "lucide-react";
import type { WmsPackingOrderDetailApi } from "../../../../api/wmsPackingApi";
import { ShippingMethodLogo } from "../../../shipping/ShippingMethodLogo";
import { packingCourierLabelCount, packingCourierName, orderNumberLabel } from "../packingHelpers";
import { ScannerHandler } from "../ScannerHandler";

export type AutoActionsViewProps = {
  detail: WmsPackingOrderDetailApi;
  onBackToOrders: () => void;
  onBackToOrder: () => void;
  onEditSellasist: () => void;
  /** Skan produktu → rozwiązanie zamówienia w kolejce (bez auto-przejścia po domknięciu). */
  onResumeProductScan: (raw: string) => void | Promise<void>;
  resumeScanBusy: boolean;
};

const DONE_STEPS = [
  "Wystawiam dokument sprzedaży",
  "Generuję list przewozowy",
  "Zmieniam status zamówienia",
] as const;

const FINAL_SCAN_INSTRUCTION =
  "Zeskanuj kolejny produkt, aby przejść do kolejnego zamówienia";

const PAGE_BG = "#eef2f6";
const ORANGE = "#e65100";

function isCashOnDelivery(detail: WmsPackingOrderDetailApi): boolean {
  const paymentMethodLower = (detail.payment_method_text ?? "").trim().toLowerCase();
  return (
    paymentMethodLower.includes("pobran") ||
    paymentMethodLower.includes("cash on delivery") ||
    paymentMethodLower.includes("cod")
  );
}

export function AutoActionsView({
  detail,
  onBackToOrders,
  onBackToOrder,
  onEditSellasist,
  onResumeProductScan,
  resumeScanBusy,
}: AutoActionsViewProps) {
  const customerComment = (detail.customer_comment ?? "").trim() || null;
  const staffNotes = (detail.staff_notes ?? "").trim() || null;
  const courierName = packingCourierName(detail);
  const labelCount = packingCourierLabelCount(detail);
  const methodForLogo = detail.shipping_method_name ?? detail.shipping_method ?? courierName;
  const cod = isCashOnDelivery(detail);
  const codAmountDisplay =
    (detail.order_value_display ?? "").trim() ||
    (detail.payment_method_text ?? "").trim() ||
    "—";

  const carton = detail.selected_carton ?? null;
  const packageNameRaw = (carton?.name ?? "").trim() || "—";
  const packageName = packageNameRaw !== "—" ? packageNameRaw.toUpperCase() : "—";
  const packageDims = (carton?.dimensions ?? "").trim() || "—";
  const packageImg = carton?.image_url?.trim();

  const showBothAlerts = Boolean(customerComment && staffNotes);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col" style={{ background: PAGE_BG }}>
      <ScannerHandler onScan={onResumeProductScan} enabled={!resumeScanBusy} />

      {/* Top actions */}
      <header className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-6 lg:px-10">
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          onClick={onBackToOrders}
        >
          Lista zamówień
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          onClick={onBackToOrder}
        >
          Wróć do zamówienia
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          onClick={onEditSellasist}
        >
          Edytuj w Sellasist
        </button>
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          aria-label="Więcej opcji"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      {/* Alert bars */}
      {(customerComment || staffNotes) && (
        <div
          className={[
            "grid shrink-0 gap-4 px-4 pb-2 pt-2 sm:px-6 lg:px-10",
            showBothAlerts ? "lg:grid-cols-2 lg:gap-6" : "grid-cols-1",
          ].join(" ")}
        >
          <div className="min-w-0">
            {customerComment ? (
              <div
                className="rounded-xl border-2 border-red-300 bg-red-50 px-5 py-5 lg:px-6 lg:py-6"
                role="status"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-red-700">Uwagi klienta</p>
                <p className="mt-3 text-xl font-semibold leading-snug text-red-950 sm:text-2xl lg:text-[1.65rem]">
                  {customerComment}
                </p>
              </div>
            ) : (
              <div className="hidden min-h-0 lg:block" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            {staffNotes ? (
              <div
                className="rounded-xl px-5 py-5 shadow-none lg:px-6 lg:py-6"
                style={{ background: "#c62828" }}
                role="status"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-white/95">Notatka</p>
                <p className="mt-3 text-xl font-bold leading-snug text-white sm:text-2xl lg:text-[1.65rem]">{staffNotes}</p>
              </div>
            ) : (
              <div className="hidden min-h-0 lg:block" aria-hidden />
            )}
          </div>
        </div>
      )}

      {/* Main terminal */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 px-4 py-5 pb-40 sm:px-6 lg:flex-row lg:gap-8 lg:px-8 lg:py-7 lg:pb-44">
        {/* LEFT — shipment */}
        <section
          className="flex min-h-0 min-w-0 flex-[1.05] flex-col rounded-2xl border border-slate-200/90 bg-white lg:min-h-[min(68vh,600px)]"
          aria-label="Przesyłka"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-2 pt-8 lg:px-10 lg:pt-10">
            <p className="text-2xl font-semibold tabular-nums text-slate-500 sm:text-3xl">
              {orderNumberLabel(detail.number)}
            </p>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <ShippingMethodLogo
                logoUrl={detail.shipping_method_logo_url}
                methodName={methodForLogo}
                size="postPackHero"
              />
              {courierName && labelCount > 1 ? (
                <p className="text-right text-sm font-medium text-slate-500">Listów: {labelCount}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-4 lg:px-10">
            <div className="flex w-full max-w-xl flex-col items-center text-center lg:max-w-none lg:items-start lg:text-left">
              <div className="mb-6 flex h-44 w-44 shrink-0 items-center justify-center sm:h-52 sm:w-52 lg:h-56 lg:w-56">
                {packageImg ? (
                  <img
                    src={packageImg}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-8xl text-slate-200" aria-hidden>
                    📦
                  </span>
                )}
              </div>
              <h2
                className="max-w-full text-balance font-black uppercase leading-none tracking-tight"
                style={{ color: ORANGE, fontSize: "clamp(2.25rem, 6vw, 4.25rem)" }}
              >
                {packageName}
              </h2>
              <p
                className="mt-4 font-bold tabular-nums leading-none"
                style={{ color: ORANGE, fontSize: "clamp(1.5rem, 4vw, 2.75rem)" }}
              >
                {packageDims}
              </p>
            </div>
          </div>

          <div className="mt-auto flex justify-end border-t border-slate-100 px-6 py-6 lg:px-10">
            <div className="text-right">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {cod ? "Kwota pobrania" : "Płatność"}
              </p>
              <p
                className={[
                  "mt-1 tabular-nums text-slate-900",
                  cod ? "text-3xl font-black sm:text-4xl" : "text-2xl font-bold text-slate-700 sm:text-3xl",
                ].join(" ")}
              >
                {cod ? codAmountDisplay : detail.payment_method_text?.trim() || "Przedpłata"}
              </p>
            </div>
          </div>
        </section>

        {/* RIGHT — workflow */}
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-slate-200/90 bg-white lg:min-h-[min(68vh,600px)]"
          aria-label="Podsumowanie operacji"
        >
          <div className="flex flex-col gap-8 px-6 pt-8 sm:gap-10 lg:flex-row lg:items-start lg:justify-between lg:px-10 lg:pt-10">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-2xl font-black text-white lg:h-16 lg:w-16 lg:text-3xl"
              aria-hidden
            >
              W
            </div>
            <ul className="min-w-0 flex-1 space-y-5 lg:ml-auto lg:max-w-xl lg:text-right">
              {DONE_STEPS.map((label) => (
                <li key={label} className="flex flex-wrap items-start gap-3 sm:gap-4 lg:justify-end">
                  <span className="min-w-0 flex-1 text-lg font-semibold leading-snug text-slate-800 sm:text-xl lg:flex-none lg:text-right lg:text-2xl">
                    {label}
                  </span>
                  <span className="shrink-0 text-2xl font-bold leading-none text-emerald-600 sm:text-3xl" aria-hidden>
                    ✓✓
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-1 flex-col justify-center px-6 pb-12 pt-10 lg:px-10">
            <div className="mx-auto w-full max-w-3xl border-t border-slate-200 pt-10">
              <p
                className="text-balance text-center font-black leading-tight text-slate-900"
                style={{ fontSize: "clamp(1.35rem, 3.2vw, 2.35rem)" }}
              >
                {FINAL_SCAN_INSTRUCTION}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Webcam / stanowisko — placeholder */}
      <div
        className="pointer-events-none fixed bottom-6 right-6 z-20 flex h-36 w-56 items-end justify-end overflow-hidden rounded-xl border-2 border-slate-300 bg-gradient-to-br from-slate-700 to-slate-900 shadow-lg sm:h-40 sm:w-64"
        aria-hidden
      >
        <span className="absolute left-3 top-3 rounded bg-red-600 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
          ● REC
        </span>
        <div className="h-full w-full bg-[linear-gradient(160deg,rgba(255,255,255,0.06)_0%,transparent_45%,rgba(0,0,0,0.35)_100%)]" />
      </div>
    </div>
  );
}
