import type { ReactNode } from "react";
import { CheckCheck, ClipboardList, Loader2, MoreVertical, PackageOpen, Printer } from "lucide-react";
import type { WmsPackingOrderDetailApi } from "../../../../api/wmsPackingApi";
import { ShippingMethodLogo } from "../../../shipping/ShippingMethodLogo";
import { orderNumberLabel, packingCourierName } from "../packingHelpers";
import {
  AUTO_ACTIONS_FINAL_SCAN,
  AUTO_ACTIONS_NOTE_RED,
  AUTO_ACTIONS_ORANGE,
  type AutoActionDisplayStep,
  type AutoActionStepKey,
  type AutoActionStepUiState,
  isPackingCashOnDelivery,
} from "./autoActionsModel";

export type AutoActionsShellProps = {
  detail: WmsPackingOrderDetailApi;
  steps: AutoActionDisplayStep[];
  onBackToOrders: () => void;
  onBackToOrder: () => void;
  onEditSellasist?: () => void;
  /** Komunikat pod listą kroków (np. skan / błąd). */
  footerMessage?: string | null;
  footerTone?: "default" | "error";
  /** Extra content under steps (retry buttons). */
  footerExtra?: ReactNode;
};

function StepGlyph({ state }: { state: AutoActionStepUiState }) {
  if (state === "SUCCESS") {
    return <CheckCheck className="h-5 w-5 shrink-0 text-slate-500" strokeWidth={2.4} aria-label="Sukces" />;
  }
  if (state === "ERROR") {
    return (
      <span className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-red-600" aria-label="Błąd">
        Błąd
      </span>
    );
  }
  if (state === "RUNNING") {
    return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-slate-700" aria-label="W trakcie" />;
  }
  if (state === "SKIPPED") {
    return <span className="h-4 w-4 shrink-0 rounded-full border border-slate-300 bg-slate-50" aria-label="Pominięto" />;
  }
  return <span className="h-4 w-4 shrink-0 rounded-full border border-slate-300" aria-label="Oczekuje" />;
}

function HeroIcon({ activeKey, allDone }: { activeKey: AutoActionStepKey | null; allDone: boolean }) {
  const wrap =
    "flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center text-slate-800 sm:h-[6.25rem] sm:w-[6.25rem]";
  if (allDone) {
    return (
      <div className={`${wrap} wms-postpack-icon-pop`} aria-hidden>
        <CheckCheck className="h-16 w-16 stroke-[1.35] text-slate-800 sm:h-[4.5rem] sm:w-[4.5rem]" />
      </div>
    );
  }
  if (activeKey === "generate_shipment") {
    return (
      <div className={`${wrap} wms-postpack-icon-pulse`} aria-hidden>
        <div className="relative">
          <PackageOpen className="h-14 w-14 stroke-[1.2] sm:h-16 sm:w-16" />
          <Printer className="absolute -bottom-1 -right-1 h-7 w-7 stroke-[1.4] text-slate-700" />
        </div>
      </div>
    );
  }
  if (activeKey === "change_order_status") {
    return (
      <div className={`${wrap} wms-postpack-icon-pulse`} aria-hidden>
        <CheckCheck className="h-16 w-16 stroke-[1.2] sm:h-[4.5rem] sm:w-[4.5rem]" />
      </div>
    );
  }
  // create_document / default
  return (
    <div className={`${wrap} wms-postpack-icon-pulse`} aria-hidden>
      <ClipboardList className="h-16 w-16 stroke-[1.25] sm:h-[4.5rem] sm:w-[4.5rem]" />
    </div>
  );
}

/**
 * Wspólny szkielet ekranu „Akcje automatyczne” — układ 1:1 z mockupu (tło białe).
 */
export function AutoActionsShell({
  detail,
  steps,
  onBackToOrders,
  onBackToOrder,
  onEditSellasist,
  footerMessage,
  footerTone = "default",
  footerExtra,
}: AutoActionsShellProps) {
  const customerComment = (detail.customer_comment ?? "").trim() || null;
  const staffNotes = (detail.staff_notes ?? "").trim() || null;
  const courierName = packingCourierName(detail);
  const methodForLogo = detail.shipping_method_name ?? detail.shipping_method ?? courierName;
  const cod = isPackingCashOnDelivery(detail);
  const codAmountDisplay = (detail.order_value_display ?? "").trim() || "—";

  const carton = detail.selected_carton ?? null;
  const packageNameRaw = (carton?.name ?? "").trim();
  const packageName = packageNameRaw ? packageNameRaw : "—";
  const packageDims = (carton?.dimensions ?? "").trim() || "—";
  const packageImg = carton?.image_url?.trim();

  const running = steps.find((s) => s.state === "RUNNING") ?? null;
  const allDone = steps.length > 0 && steps.every((s) => s.state === "SUCCESS" || s.state === "SKIPPED");
  const showFooter = Boolean(footerMessage) || allDone;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col bg-white">
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
        {onEditSellasist ? (
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            onClick={onEditSellasist}
          >
            Edytuj w Sellasist
          </button>
        ) : null}
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          aria-label="Więcej opcji"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      <div className="grid shrink-0 gap-4 px-4 pt-1 sm:px-6 lg:grid-cols-2 lg:gap-6 lg:px-10">
        <div className="min-w-0">
          {customerComment ? (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3" role="status">
              <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">Uwagi klienta</p>
              <p className="mt-1 text-base font-semibold leading-snug text-red-900 sm:text-lg">{customerComment}</p>
            </div>
          ) : (
            <div className="hidden min-h-[1px] lg:block" aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          {staffNotes ? (
            <div className="rounded-lg px-4 py-3 text-white" style={{ background: AUTO_ACTIONS_NOTE_RED }} role="status">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/95">Notatka</p>
              <p className="mt-1 text-base font-bold leading-snug sm:text-lg">{staffNotes}</p>
            </div>
          ) : (
            <div className="hidden min-h-[1px] lg:block" aria-hidden />
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-4 py-4 pb-36 sm:px-6 lg:flex-row lg:gap-6 lg:px-10 lg:py-5 lg:pb-40">
        {/* Left — karta zamówienia */}
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] lg:min-h-[min(62vh,560px)]"
          aria-label="Zamówienie"
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-7 lg:px-8 lg:pt-8">
            <p className="text-2xl font-semibold tabular-nums text-slate-500 sm:text-[1.75rem]">
              {orderNumberLabel(detail.number)}
            </p>
            <div className="flex max-w-[45%] shrink-0 justify-end">
              <ShippingMethodLogo
                logoUrl={detail.shipping_method_logo_url}
                methodName={methodForLogo}
                size="postPackHero"
              />
            </div>
          </div>

          <div className="flex flex-1 flex-col px-6 pb-6 pt-4 lg:px-8 lg:pb-8">
            <div className="mb-5 flex h-36 w-36 items-center justify-center sm:h-40 sm:w-40">
              {packageImg ? (
                <img src={packageImg} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
              ) : (
                <span className="text-7xl text-slate-200" aria-hidden>
                  📦
                </span>
              )}
            </div>

            <div className="mt-auto flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <h2
                  className="font-black uppercase leading-none tracking-tight"
                  style={{ color: AUTO_ACTIONS_ORANGE, fontSize: "clamp(1.75rem, 4.2vw, 2.75rem)" }}
                >
                  {packageName}
                </h2>
                <p
                  className="mt-2 font-bold tabular-nums leading-none"
                  style={{ color: AUTO_ACTIONS_ORANGE, fontSize: "clamp(1.15rem, 2.8vw, 1.75rem)" }}
                >
                  {packageDims}
                </p>
              </div>
              {cod ? (
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-500">Kwota pobrania</p>
                  <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-900 sm:text-3xl">{codAmountDisplay}</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* Right — panel akcji */}
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] lg:min-h-[min(62vh,560px)]"
          aria-label="Akcje automatyczne"
        >
          <div className="flex flex-1 flex-col px-6 py-7 lg:px-8 lg:py-8">
            <div key={running?.key ?? (allDone ? "done" : "idle")} className="wms-postpack-step-enter flex gap-4 sm:gap-5">
              <HeroIcon activeKey={running?.key ?? steps[0]?.key ?? null} allDone={allDone} />
              <ul className="min-w-0 flex-1 space-y-3.5 pt-1">
                {steps.length === 0 ? (
                  <li className="text-base font-semibold text-slate-500">Brak włączonych akcji automatycznych.</li>
                ) : (
                  steps.map((step) => {
                    const active = step.state === "RUNNING";
                    const done = step.state === "SUCCESS" || step.state === "SKIPPED";
                    return (
                      <li key={step.key} className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                          <StepGlyph state={step.state} />
                        </span>
                        <div className="min-w-0">
                          <p
                            className={[
                              "text-[15px] leading-snug sm:text-base",
                              active ? "font-bold text-slate-900" : "",
                              done && !active ? "font-medium text-slate-400" : "",
                              step.state === "ERROR" ? "font-bold text-red-700" : "",
                              step.state === "PENDING" ? "font-medium text-slate-500" : "",
                            ].join(" ")}
                          >
                            {step.label}
                          </p>
                          {step.state === "ERROR" && step.message ? (
                            <p className="mt-0.5 text-sm text-red-600">{step.message}</p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>

            {showFooter || footerExtra ? (
              <div className="mt-auto border-t border-slate-200 pt-8">
                {footerMessage || (allDone && !footerMessage) ? (
                  <p
                    className={[
                      "text-balance text-center font-black leading-tight",
                      footerTone === "error" ? "text-red-700" : "text-slate-900",
                    ].join(" ")}
                    style={{ fontSize: "clamp(1.2rem, 2.6vw, 1.85rem)" }}
                  >
                    {footerMessage ?? AUTO_ACTIONS_FINAL_SCAN}
                  </p>
                ) : null}
                {footerExtra}
              </div>
            ) : null}
          </div>
        </section>
      </div>

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
