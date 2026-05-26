import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type { WmsPackingOrderDetailApi } from "../../../api/wmsPackingApi";
import { ShippingMethodLogo } from "../../shipping/ShippingMethodLogo";
import { orderNumberLabel, packingCourierName, packingCourierLabelCount } from "./packingHelpers";

const PAGE_BG = "#eef2f6";

const STEPS = [
  "Wystawiam dokument sprzedaży",
  "Generuję list przewozowy",
  "Zmieniam status zamówienia",
] as const;

function isCashOnDelivery(detail: WmsPackingOrderDetailApi): boolean {
  const paymentMethodLower = (detail.payment_method_text ?? "").trim().toLowerCase();
  return (
    paymentMethodLower.includes("pobran") ||
    paymentMethodLower.includes("cash on delivery") ||
    paymentMethodLower.includes("cod")
  );
}

export type PackingFinalizationViewProps = {
  detail: WmsPackingOrderDetailApi;
  runPostPackFinish: () => Promise<boolean>;
  postPackFinishBusy: boolean;
};

/**
 * Krok 3: wyłącznie tutaj uruchamiany jest POST …/finish (dokument, etykieta, status).
 * Do momentu sukcesu nie wracamy na ekran pakowania produktów.
 */
export function PackingFinalizationView({ detail, runPostPackFinish, postPackFinishBusy }: PackingFinalizationViewProps) {
  const [runId, setRunId] = useState(0);
  const [failed, setFailed] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const stepTimerRef = useRef<ReturnType<typeof window.setInterval> | undefined>(undefined);

  const courierName = packingCourierName(detail);
  const labelCount = packingCourierLabelCount(detail);
  const methodForLogo = detail.shipping_method_name ?? detail.shipping_method ?? courierName;
  const cod = isCashOnDelivery(detail);
  const codAmountDisplay =
    (detail.order_value_display ?? "").trim() || (detail.payment_method_text ?? "").trim() || "—";

  const carton = detail.selected_carton ?? null;
  const packageName = (carton?.name ?? "").trim() || "—";
  const packageDims = (carton?.dimensions ?? "").trim() || "—";
  const packageImg = carton?.image_url?.trim();

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setActiveStep(0);
    if (stepTimerRef.current !== undefined) {
      window.clearInterval(stepTimerRef.current);
      stepTimerRef.current = undefined;
    }
    stepTimerRef.current = window.setInterval(() => {
      setActiveStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, 1100);

    void (async () => {
      const ok = await runPostPackFinish();
      if (stepTimerRef.current !== undefined) {
        window.clearInterval(stepTimerRef.current);
        stepTimerRef.current = undefined;
      }
      if (cancelled) return;
      if (ok) setActiveStep(STEPS.length);
      else setFailed(true);
    })();

    return () => {
      cancelled = true;
      if (stepTimerRef.current !== undefined) {
        window.clearInterval(stepTimerRef.current);
        stepTimerRef.current = undefined;
      }
    };
  }, [runId, runPostPackFinish]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col" style={{ background: PAGE_BG }}>
      <div className="flex min-h-0 flex-1 flex-col gap-5 px-4 py-5 pb-36 sm:px-6 lg:flex-row lg:gap-8 lg:px-8 lg:py-6 lg:pb-40">
        <section
          className="flex min-h-0 min-w-0 flex-[1] flex-col rounded-2xl border border-slate-200/90 bg-white shadow-sm lg:max-w-xl"
          aria-label="Podsumowanie przesyłki"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 lg:px-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Zamówienie</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-800">{orderNumberLabel(detail.number)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <ShippingMethodLogo logoUrl={detail.shipping_method_logo_url} methodName={methodForLogo} size="packingTile" />
              {courierName ? <p className="max-w-[10rem] text-right text-xs font-semibold text-slate-800">{courierName}</p> : null}
              {labelCount > 1 ? <p className="text-[11px] font-medium text-slate-500">Listów: {labelCount}</p> : null}
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center px-5 py-5 lg:flex-row lg:items-start lg:gap-5 lg:px-6 lg:py-5">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center sm:h-32 sm:w-32">
              {packageImg ? (
                <img src={packageImg} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
              ) : (
                <span className="text-6xl text-slate-200" aria-hidden>
                  📦
                </span>
              )}
            </div>
            <div className="mt-4 min-w-0 flex-1 text-center lg:mt-0 lg:text-left">
              <h2 className="text-lg font-black uppercase leading-tight tracking-tight text-slate-900">{packageName}</h2>
              <p className="mt-2 text-base font-bold tabular-nums text-slate-700">{packageDims}</p>
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{cod ? "Pobranie" : "Płatność"}</p>
                <p className={`mt-0.5 font-bold tabular-nums ${cod ? "text-lg text-slate-900" : "text-sm text-slate-700"}`}>
                  {cod ? codAmountDisplay : detail.payment_method_text?.trim() || "Przedpłata"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="flex min-h-0 min-w-0 flex-[1.1] flex-col rounded-2xl border border-slate-200/90 bg-white shadow-sm"
          aria-label="Automatyzacje po pakowaniu"
        >
          <div className="border-b border-slate-100 px-5 py-4 lg:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Finalizacja</p>
            <p className="mt-1 text-base font-bold text-slate-900">Trwa zamykanie pakowania w systemie</p>
          </div>
          <ul className="flex flex-col gap-3 px-5 py-5 lg:px-6">
            {STEPS.map((label, idx) => {
              const done = !postPackFinishBusy && !failed && activeStep > idx;
              const active = postPackFinishBusy && !failed && activeStep === idx;
              return (
                <li key={label} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden>
                    {done ? (
                      <span className="text-lg font-bold text-emerald-600">✓</span>
                    ) : active ? (
                      <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
                    ) : (
                      <span className="h-5 w-5 rounded-full border border-slate-300 bg-white" />
                    )}
                  </span>
                  <span
                    className={[
                      "min-w-0 text-sm leading-snug",
                      done ? "font-medium text-slate-500 line-through decoration-slate-300" : "",
                      active ? "font-bold text-slate-900" : "",
                      !done && !active ? "text-slate-600" : "",
                    ].join(" ")}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
          {failed ? (
            <div className="mt-auto border-t border-amber-100 bg-amber-50/90 px-5 py-4 lg:px-6">
              <p className="text-sm font-semibold text-amber-950">Nie udało się dokończyć operacji. Sprawdź komunikat i spróbuj ponownie.</p>
              <button
                type="button"
                onClick={() => setRunId((n) => n + 1)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-50"
              >
                <RefreshCw className="h-4 w-4" />
                Ponów finalizację
              </button>
            </div>
          ) : null}
        </section>
      </div>

      <div
        className="pointer-events-none fixed bottom-5 right-5 z-20 flex h-32 w-48 items-end justify-end overflow-hidden rounded-xl border-2 border-slate-300 bg-gradient-to-br from-slate-700 to-slate-900 shadow-lg sm:h-36 sm:w-56"
        aria-hidden
      >
        <span className="absolute left-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          ● REC
        </span>
        <div className="h-full w-full bg-[linear-gradient(160deg,rgba(255,255,255,0.06)_0%,transparent_45%,rgba(0,0,0,0.35)_100%)]" />
      </div>
    </div>
  );
}
