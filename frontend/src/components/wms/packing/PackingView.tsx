import { useCallback, useEffect, useRef } from "react";
import type {
  PackagingEngineSourceApi,
  WmsPackingOrderDetailApi,
  WmsPackingOrderLineApi,
  WmsPackingRecommendedCartonApi,
} from "../../../api/wmsPackingApi";
import { useWmsScanner } from "../../../context/WmsScannerContext";
import type { WmsPackingInterfaceDisplay } from "../../../types/wmsPackingSettings";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import { BundlePackingTree } from "./BundlePackingTree";
import { CourierBadge } from "./CourierBadge";
import {
  isPackingOrderCompleted,
  lineQuantityRequired,
  orderNumberLabel,
  packingCourierLabelCount,
  packingCourierName,
} from "./packingHelpers";
import { ActiveCard } from "./ActiveCard";
import { DefaultCard } from "./DefaultCard";
import { DoneCard } from "./DoneCard";
import { ScannerHandler } from "./ScannerHandler";
import { PackingMainCartonLeft, PackingRecommendedCartonsPanel } from "./PackingRecommendedCartons";

const NOTES_RED = "#d32f2f";
const PRIMARY_GREEN = "#4caf50";
const ALERT_BG = "#ffebee";

function packagingEngineOperatorLabel(source: PackagingEngineSourceApi): string {
  switch (source) {
    case "SMART_MATCHING":
      return "Smart Matching";
    case "THREE_D_MATCHING":
      return "3D Matching";
    case "COMBINED":
      return "Połączone";
    default:
      return source;
  }
}

function IconPhoneSmall() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-600" aria-hidden>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function IconChatSquare() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
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

type PackingViewProps = {
  detail: WmsPackingOrderDetailApi;
  sortedLines: WmsPackingOrderLineApi[];
  activeProductId: number | null;
  flashItemId: number | null;
  packQty: number;
  scanBusy: boolean;
  linePackBusy: boolean;
  onScan: (raw: string) => void;
  confirmPack: (orderItemId?: number, qtyOverride?: number) => void | Promise<void>;
  packAll: () => void | Promise<void>;
  activateProduct: (orderItemId: number) => void;
  onPackQtyChange: (orderItemId: number, qty: number) => void;
  navigate: (to: string) => void;
  refocusScannerInput: () => void;
  onInterrupt: () => void;
  recommendedCartons: WmsPackingRecommendedCartonApi[];
  selectedCartonId: string | null | undefined;
  onSelectCarton: (cartonId: string) => void;
  selectCartonBusy: boolean;
  interfaceDisplay: WmsPackingInterfaceDisplay;
  /** Z sesji JWT (`/auth/me`) — bez cache localStorage. */
  packerDisplayName?: string | null;
  /** Modal wyboru kartonu — blokuje skany i pakowanie do potwierdzenia opakowania. */
  packingActionsLocked?: boolean;
  /** Lista kartonów w nagłówku — domyślnie wyłączona (propozycja tylko w sidebarze). */
  showHeaderCartonPicker?: boolean;
};

export function PackingView({
  detail,
  sortedLines,
  activeProductId,
  flashItemId,
  packQty,
  scanBusy,
  linePackBusy,
  onScan,
  confirmPack,
  packAll,
  activateProduct,
  onPackQtyChange,
  navigate,
  refocusScannerInput,
  onInterrupt,
  recommendedCartons,
  selectedCartonId,
  onSelectCarton,
  selectCartonBusy,
  interfaceDisplay,
  packerDisplayName,
  packingActionsLocked = false,
  showHeaderCartonPicker = false,
}: PackingViewProps) {
  const { setScannerInputPlaceholder } = useWmsScanner();
  const wedgeRef = useRef<HTMLInputElement>(null);

  const telefon = (detail.customer_phone ?? "").trim() || "—";
  const notatkiMag = (detail.staff_notes ?? "").trim();
  const salesLabel = (detail.sales_document_label ?? "").trim();
  const hasSalesDocument = !!salesLabel;
  const docPrefixUpper = ((detail.document_prefix ?? "Pa") as string).trim().toUpperCase();
  const grayDocumentBadgeLabel = docPrefixUpper === "FA" ? "Faktura" : "Paragon";
  const basketCodeRaw = (detail.basket_code ?? "").trim();
  const hasBasketLabel = Boolean(basketCodeRaw);
  const cartLabel = (detail.cart_display_code ?? "").trim() || "—";
  const uwagiKlienta = (detail.customer_comment ?? "").trim();
  const qIdx = detail.queue_index ?? 1;
  const qTot = detail.queue_total ?? 1;
  const clientName = (detail.customer_name ?? "").trim() || "—";
  const orderValueDisplay = (detail.order_value_display ?? "").trim();
  const paymentMethodLower = (detail.payment_method_text ?? "").trim().toLowerCase();
  const isCashOnDelivery =
    paymentMethodLower.includes("pobran") ||
    paymentMethodLower.includes("cash on delivery") ||
    paymentMethodLower.includes("cod");

  const packerLabel = (packerDisplayName ?? "").trim() || "—";

  useEffect(() => {
    setScannerInputPlaceholder("Zeskanuj EAN");
  }, [setScannerInputPlaceholder]);

  const handleConfirmPack = useCallback(
    (orderItemId: number, qtyOverride?: number) => {
      void confirmPack(orderItemId, qtyOverride);
    },
    [confirmPack],
  );

  useEffect(() => {
    refocusScannerInput();
    wedgeRef.current?.focus({ preventScroll: true });
  }, [activeProductId, detail.order_id, refocusScannerInput]);

  const wszystkoSpakowane = isPackingOrderCompleted(detail);
  const telHref = telefon !== "—" ? telefon.replace(/\s/g, "") : "";

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white lg:flex-row">
      <input
        ref={wedgeRef}
        type="text"
        tabIndex={-1}
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
        aria-hidden
        readOnly
      />

      <ScannerHandler
        onScan={onScan}
        enabled={!wszystkoSpakowane && !scanBusy && !packingActionsLocked}
      />

      {/* LEFT */}
      <aside
        className="flex w-full shrink-0 flex-col border-slate-200/80 bg-white shadow-sm lg:h-full lg:min-h-0 lg:w-[300px] lg:min-w-[300px] lg:max-w-[300px] lg:overflow-y-auto lg:rounded-r-xl lg:border-r"
        style={{ boxShadow: "0 1px 6px rgba(15, 23, 42, 0.06)" }}
        aria-label="Przesyłka"
      >
        <div className="flex flex-1 flex-col gap-3 p-3 pb-3">
          {hasSalesDocument ? (
            <span
              className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold text-white"
              style={{ background: "#2e7d32" }}
            >
              <span>Fa</span>
              <span className="font-semibold tabular-nums">{salesLabel}</span>
            </span>
          ) : (
            <span className="inline-flex w-fit rounded-md bg-slate-400 px-2.5 py-1 text-xs font-bold text-white">
              {grayDocumentBadgeLabel}
            </span>
          )}

          <div className="min-w-0">
            <p className="text-2xl font-black tabular-nums leading-none text-slate-900">#{qIdx}</p>
            {qTot > 1 ? (
              <p className="mt-1 text-xs font-medium text-slate-500">
                Pozycja w kolejce: {qIdx} / {qTot}
              </p>
            ) : null}
          </div>

          <CourierBadge
            variant="sidebar"
            courierName={packingCourierName(detail)}
            labelCount={packingCourierLabelCount(detail)}
            logoUrl={detail.shipping_method_logo_url}
            methodNameForLogo={detail.shipping_method_name ?? detail.shipping_method}
          />

          {detail.wms_operational_logistics_lines?.filter((x) => String(x).trim()).length ? (
            <div className="min-w-0 border-t border-slate-200/90 pt-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Logistyka</p>
              <div className="mt-1 space-y-0.5">
                {(detail.wms_operational_logistics_lines ?? [])
                  .map((x) => String(x).trim())
                  .filter(Boolean)
                  .map((ln) => (
                    <p key={ln} className="text-xs font-medium leading-snug text-slate-700">
                      {ln}
                    </p>
                  ))}
              </div>
            </div>
          ) : null}

          <div className="min-w-0 border-t border-slate-200/90 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Klient</p>
            <p className="mt-1 text-base font-bold leading-snug text-slate-900">{clientName}</p>
          </div>

          {orderValueDisplay ? (
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {isCashOnDelivery ? "Pobranie" : "Wartość"}
              </p>
              <p className="mt-1 text-base font-semibold tabular-nums text-slate-900">{orderValueDisplay}</p>
              {!isCashOnDelivery && detail.payment_method_text?.trim() ? (
                <p className="mt-1 text-xs font-medium text-slate-600">{detail.payment_method_text.trim()}</p>
              ) : null}
            </div>
          ) : null}

          <div className="min-w-0 border-t border-slate-200/90 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Karton</p>
            <PackingMainCartonLeft carton={detail.selected_carton} />
            {(() => {
              const top = detail.packaging_suggestions?.[0];
              if (!top) return null;
              const confPct = `${Math.round(Math.min(1, Math.max(0, top.confidence_score)) * 100)}%`;
              const img = top.image_url?.trim();
              return (
                <div className="mt-1.5 flex gap-2 rounded-md border border-slate-200/90 bg-white p-1.5 shadow-sm">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden">
                    {img ? (
                      <img src={img} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                    ) : (
                      <span className="text-xl text-slate-300" aria-hidden>
                        📦
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-xs font-bold text-slate-900">{top.package_name}</p>
                    <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
                      {top.package_dimensions?.trim() || "—"}
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                      {packagingEngineOperatorLabel(top.source_engine)} {confPct}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="border-t border-slate-200/90 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Telefon</p>
            <p className="mt-1 inline-flex flex-wrap items-center gap-2 text-lg font-bold tabular-nums text-slate-900">
              <IconPhoneSmall />
              {telefon !== "—" ? (
                <a href={`tel:${telHref}`} className="hover:underline">
                  {telefon}
                </a>
              ) : (
                <span>—</span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-md border-2 border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50"
                aria-label="Korespondencja"
              >
                <IconChatSquare />
                <span className="text-sm font-semibold">Korespondencja</span>
              </button>
            </div>
          </div>

          {notatkiMag ? (
            <div className="rounded-lg px-3 py-2.5 text-white shadow-sm" style={{ background: NOTES_RED }}>
              <p className="text-xs font-bold uppercase tracking-wide">Notatki</p>
              <p className="mt-1 text-sm font-medium leading-snug">{notatkiMag}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-slate-200/90 p-3">
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              aria-label="Opcje"
            >
              <IconDots />
            </button>
            <button
              type="button"
              disabled={wszystkoSpakowane || scanBusy || packingActionsLocked}
              className="min-h-12 flex-1 rounded-lg px-4 text-base font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: PRIMARY_GREEN }}
              onClick={() => void packAll()}
            >
              Spakuj wszystko
            </button>
          </div>
          <button
            type="button"
            className="min-h-11 w-full rounded-lg border-2 border-slate-400 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={onInterrupt}
          >
            Przerwij
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-slate-200/90 bg-white">
          <div className="flex flex-col gap-2 px-4 py-2 sm:px-4">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  onClick={() => navigate(WMS_ROUTES.packingOrders)}
                  aria-label="Wróć"
                >
                  <IconBack />
                </button>
                <span className="text-xl font-bold text-slate-900">{orderNumberLabel(detail.number)}</span>
                <span className="text-3xl font-black tabular-nums text-slate-900 sm:text-4xl">
                  {qIdx}/{qTot}
                </span>
              </div>
              <div className="min-w-0 flex-1 text-sm text-slate-600">
                <p>
                  Wózek: <span className="font-semibold text-slate-900">{cartLabel}</span>
                  {hasBasketLabel ? (
                    <>
                      {", "}
                      Koszyk: <span className="font-semibold text-slate-900">{basketCodeRaw}</span>
                    </>
                  ) : null}
                </p>
                <p className="mt-0.5">
                  Osoba pakująca: <span className="font-semibold text-slate-900">{packerLabel}</span>
                </p>
              </div>
              {showHeaderCartonPicker ? (
                <PackingRecommendedCartonsPanel
                  items={recommendedCartons}
                  selectedId={selectedCartonId}
                  busy={selectCartonBusy || packingActionsLocked}
                  onSelect={onSelectCarton}
                />
              ) : null}
            </div>

            {uwagiKlienta ? (
              <div
                className="rounded-lg border px-3 py-2 text-sm font-semibold text-red-800"
                style={{ background: ALERT_BG, borderColor: "#ffcdd2" }}
              >
                UWAGI KLIENTA: {uwagiKlienta}
              </div>
            ) : null}
          </div>
        </header>

        <section className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2" aria-label="Produkty">
          {detail.bundle_trees && detail.bundle_trees.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Zestawy</p>
              <BundlePackingTree trees={detail.bundle_trees} />
            </div>
          ) : null}
          {wszystkoSpakowane ? (
            <p className="mb-3 text-center text-base font-semibold text-emerald-800">Zamówienie spakowane.</p>
          ) : null}
          <ul className="grid list-none gap-3 [grid-template-columns:repeat(1,minmax(0,1fr))] p-0 lg:grid-cols-2 xl:grid-cols-3 lg:items-stretch">
            {sortedLines.map((line) => {
              const done = line.quantity_packed >= lineQuantityRequired(line);
              const active = !done && activeProductId === line.order_item_id;
              const flash = flashItemId === line.order_item_id;
              return (
                <li key={line.order_item_id} className="flex min-h-0 min-w-0">
                  {done ? (
                    <DoneCard line={line} flash={flash} fieldVisibility={interfaceDisplay} />
                  ) : active ? (
                    <ActiveCard
                      line={line}
                      packQty={packQty}
                      flash={flash}
                      scanBusy={scanBusy || packingActionsLocked}
                      linePackBusy={linePackBusy}
                      fieldVisibility={interfaceDisplay}
                      onPackQtyChange={onPackQtyChange}
                      onConfirmPack={handleConfirmPack}
                    />
                  ) : (
                    <DefaultCard
                      line={line}
                      scanBusy={scanBusy || packingActionsLocked}
                      fieldVisibility={interfaceDisplay}
                      onActivate={activateProduct}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
