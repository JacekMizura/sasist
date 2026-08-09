import { useCallback, useEffect, useRef } from "react";
import type {
  WmsOperationalNoteBriefApi,
  WmsPackingOrderDetailApi,
  WmsPackingOrderLineApi,
  WmsPackingRecommendedCartonApi,
} from "../../../api/wmsPackingApi";
import { useWmsScanner } from "../../../context/WmsScannerContext";
import type { WmsPackingInterfaceDisplay } from "../../../types/wmsPackingSettings";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import { BundlePackingTree } from "./BundlePackingTree";
import { BundleVerifiedBadge } from "../bundle/BundleVerifiedBadge";
import { BundleTraceabilityStrip } from "../bundle/BundleTraceabilityStrip";
import type { BundleScanOut } from "../../../api/bundlesLogisticsApi";
import { shouldShowBundleVerifiedBadge } from "../../../utils/bundleScanFlow";
import {
  isPackingOrderCompleted,
  lineQuantityRequired,
  orderNumberLabel,
} from "./packingHelpers";
import { ActiveCard } from "./ActiveCard";
import { DefaultCard } from "./DefaultCard";
import { DoneCard } from "./DoneCard";
import { ScannerHandler } from "./ScannerHandler";
import { PackingRecommendedCartonsPanel } from "./PackingRecommendedCartons";
import { PackingAutomationActivators } from "./PackingAutomationActivators";
import type {
  PackingAutomationButtonsPosition,
  PackingCustomerCommentStyle,
  PackingSalesDocPreview,
} from "../../../types/wmsPackingExtendedUi";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import { PackingCustomerCommentBanner } from "./PackingCustomerCommentBanner";
import { PackingOrderSidebar } from "./PackingOrderSidebar";
import {
  DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
  type PackingProductFieldVisibility,
} from "./packingProductDisplay";

function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
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
  onSelectCarton: (cartonId: string, opts?: { confirmOverride?: boolean }) => void;
  selectCartonBusy: boolean;
  /** Widoczność pól produktu (ustawienia WMS → Pakowanie → Widok). */
  productFieldVisibility?: PackingProductFieldVisibility;
  /** @deprecated Prefer ``productFieldVisibility``. */
  interfaceDisplay?: WmsPackingInterfaceDisplay;
  /** Z sesji JWT (`/auth/me`) — bez cache localStorage. */
  packerDisplayName?: string | null;
  /** Modal wyboru kartonu — blokuje skany i pakowanie do potwierdzenia opakowania. */
  packingActionsLocked?: boolean;
  /** Notatki operacyjne już przefiltrowane wg „Pokaż wszystkie notatki”. */
  visibleOperationalNotes?: WmsOperationalNoteBriefApi[];
  /** Lista kartonów w nagłówku — domyślnie włączona (mockup). */
  showHeaderCartonPicker?: boolean;
  bundlePackScan?: BundleScanOut | null;
  /**
   * Po skanie z listy, gdy linie już kompletne — CTA zamiast auto-modala kartonu.
   */
  showProceedAfterLinesCompleteCta?: boolean;
  onProceedAfterLinesComplete?: () => void;
  onMarkLineShortage?: (orderItemId: number) => void;
  /** Aktywatory akcji automatycznych (widoczność + filtr „Pakowanie WMS”). */
  showAutomationButtons?: boolean;
  automationButtonsPosition?: PackingAutomationButtonsPosition;
  warehouseId?: number | null;
  onAutomationToast?: (message: string) => void;
  onAutomationStatusChanged?: () => void;
  customerCommentStyle?: PackingCustomerCommentStyle;
  salesDocumentPreview?: PackingSalesDocPreview;
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
  productFieldVisibility = DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
  packerDisplayName,
  packingActionsLocked = false,
  visibleOperationalNotes = [],
  showHeaderCartonPicker = true,
  bundlePackScan = null,
  showProceedAfterLinesCompleteCta = false,
  onProceedAfterLinesComplete,
  onMarkLineShortage,
  showAutomationButtons = false,
  automationButtonsPosition = "bottom",
  warehouseId = null,
  onAutomationToast,
  onAutomationStatusChanged,
  customerCommentStyle = "normal",
  salesDocumentPreview = "simplified",
}: PackingViewProps) {
  const { setScannerInputPlaceholder } = useWmsScanner();
  const wedgeRef = useRef<HTMLInputElement>(null);

  const basketCodeRaw = (detail.basket_code ?? "").trim();
  const hasBasketLabel = Boolean(basketCodeRaw);
  const cartLabel = (detail.cart_display_code ?? "").trim() || "—";
  const uwagiKlienta = (detail.customer_comment ?? "").trim();
  const qIdx = detail.queue_index ?? 1;
  const qTot = detail.queue_total ?? 1;
  const packerLabel = (packerDisplayName ?? "").trim() || "—";

  const commentHighlighted = customerCommentStyle === "highlighted";
  const showCommentBanner = commentHighlighted && !!uwagiKlienta;
  /** Wyróżniony komentarz → zawsze dokument uproszczony (jak mockup); inaczej ustawienie widoku dokumentu. */
  const effectiveDocumentPreview: PackingSalesDocPreview = commentHighlighted
    ? "simplified"
    : salesDocumentPreview;

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

  const headerCartons =
    recommendedCartons.length > 0
      ? recommendedCartons
      : detail.selected_carton
        ? [detail.selected_carton]
        : [];

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white lg:flex-row lg:gap-3 lg:p-3">
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

      <PackingOrderSidebar
        detail={detail}
        salesDocumentPreview={effectiveDocumentPreview}
        commentInBanner={commentHighlighted}
        wszystkoSpakowane={wszystkoSpakowane}
        scanBusy={scanBusy}
        packingActionsLocked={packingActionsLocked}
        visibleOperationalNotes={visibleOperationalNotes}
        selectCartonBusy={selectCartonBusy}
        onSelectCarton={onSelectCarton}
        packAll={packAll}
        onInterrupt={onInterrupt}
        showAutomationButtons={showAutomationButtons}
        automationButtonsPosition={automationButtonsPosition}
        warehouseId={warehouseId}
        onAutomationToast={onAutomationToast}
        onAutomationStatusChanged={onAutomationStatusChanged}
      />

      {/* MAIN */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="shrink-0 border-b border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                onClick={() => navigate(WMS_ROUTES.packingOrders)}
                aria-label="Wróć"
              >
                <IconBack />
              </button>
              <span className="text-lg font-bold text-slate-900 sm:text-xl">
                {orderNumberLabel(detail.number)}
              </span>
              <span className="text-2xl font-black tabular-nums text-slate-900 sm:text-3xl">
                {qIdx}/{qTot}
              </span>
            </div>

            <div className="min-w-0 flex-1 text-sm text-slate-600">
              <p className="truncate">
                Wózek: <span className="font-semibold text-slate-900">{cartLabel}</span>
                {hasBasketLabel ? (
                  <>
                    {", "}
                    Koszyk: <span className="font-semibold text-slate-900">{basketCodeRaw}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-0.5 truncate">
                Osoba pakująca: <span className="font-semibold text-slate-900">{packerLabel}</span>
              </p>
            </div>

            {showHeaderCartonPicker && headerCartons.length > 0 ? (
              <PackingRecommendedCartonsPanel
                items={headerCartons}
                selectedId={selectedCartonId ?? detail.selected_carton_id}
                busy={selectCartonBusy || packingActionsLocked}
                onSelect={onSelectCarton}
              />
            ) : null}
          </div>
        </header>

        {showCommentBanner ? <PackingCustomerCommentBanner comment={uwagiKlienta} /> : null}

        <section className="min-h-0 flex-1 overflow-y-auto bg-white px-3 pb-4 pt-2" aria-label="Produkty">
          {detail.bundle_trees && detail.bundle_trees.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Zestawy</p>
              <BundlePackingTree trees={detail.bundle_trees} />
            </div>
          ) : null}
          {bundlePackScan && shouldShowBundleVerifiedBadge(bundlePackScan) ? (
            <BundleVerifiedBadge bundleName={bundlePackScan.bundle_name} className="mb-4" />
          ) : null}
          {bundlePackScan?.traceability_links ? (
            <BundleTraceabilityStrip links={bundlePackScan.traceability_links} className="mb-4" />
          ) : null}
          {wszystkoSpakowane ? (
            <div className="mb-3 space-y-3 text-center">
              <p className="text-base font-semibold text-emerald-800">Zamówienie spakowane.</p>
              {showProceedAfterLinesCompleteCta && onProceedAfterLinesComplete ? (
                <button
                  type="button"
                  onClick={onProceedAfterLinesComplete}
                  className="rounded-xl bg-[#5a4fcf] px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-[#4a40b2] active:scale-95"
                >
                  Wybierz opakowanie
                </button>
              ) : null}
            </div>
          ) : null}
          <ul className="grid list-none gap-3 [grid-template-columns:repeat(1,minmax(0,1fr))] bg-white p-0 lg:grid-cols-2 xl:grid-cols-3 lg:items-stretch">
            {sortedLines.map((line) => {
              const done = line.quantity_packed >= lineQuantityRequired(line);
              const active = !done && activeProductId === line.order_item_id;
              const flash = flashItemId === line.order_item_id;
              return (
                <li key={line.order_item_id} className="flex min-h-0 min-w-0">
                  {done ? (
                    <DoneCard line={line} flash={flash} fieldVisibility={productFieldVisibility} />
                  ) : active ? (
                    <ActiveCard
                      line={line}
                      packQty={packQty}
                      flash={flash}
                      scanBusy={scanBusy || packingActionsLocked}
                      linePackBusy={linePackBusy}
                      fieldVisibility={productFieldVisibility}
                      onPackQtyChange={onPackQtyChange}
                      onConfirmPack={handleConfirmPack}
                      onMarkShortage={
                        packingActionsLocked || !onMarkLineShortage ? undefined : onMarkLineShortage
                      }
                    />
                  ) : (
                    <DefaultCard
                      line={line}
                      scanBusy={scanBusy || packingActionsLocked}
                      fieldVisibility={productFieldVisibility}
                      onActivate={activateProduct}
                      onMarkShortage={
                        packingActionsLocked || !onMarkLineShortage ? undefined : onMarkLineShortage
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        {showAutomationButtons &&
        warehouseId != null &&
        warehouseId > 0 &&
        automationButtonsPosition === "floating" ? (
          <PackingAutomationActivators
            tenantId={DAMAGE_TENANT_ID}
            warehouseId={warehouseId}
            orderId={detail.order_id}
            showAutomationButtons={showAutomationButtons}
            position="floating"
            onToast={onAutomationToast}
            onStatusChanged={onAutomationStatusChanged}
          />
        ) : null}
      </div>
    </div>
  );
}
