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
  PackingLayoutMode,
  PackingProductDisplayMode,
  PackingSalesDocPreview,
} from "../../../types/wmsPackingExtendedUi";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import { PackingCustomerCommentBanner } from "./PackingCustomerCommentBanner";
import { PackingOrderFullWidthInfo } from "./PackingOrderFullWidthInfo";
import { PackingOrderSidebar } from "./PackingOrderSidebar";
import {
  DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
  type PackingProductFieldVisibility,
} from "./packingProductDisplay";
import {
  packingProductCardItemClass,
  packingProductCardItemStyle,
  packingProductCardsContainerClass,
  packingProductCardsContainerStyle,
} from "./packingProductCardLayout";
import { PackingCartBasketBadges, PackingPackAllIconButton } from "./PackingHeaderChrome";

function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
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
  /** `with_sidebar` = lewy panel; `full_width` = pas info + siatka na całą szerokość. */
  layoutMode?: PackingLayoutMode;
  /** `list` = kompaktowe karty poziome; `grid` = pionowe z dużym zdjęciem. */
  productDisplayMode?: PackingProductDisplayMode;
  showOrderPhone?: boolean;
  showOrderValue?: boolean;
  showShippingAddress?: boolean;
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
  layoutMode = "with_sidebar",
  productDisplayMode = "list",
  showOrderPhone = true,
  showOrderValue = true,
  showShippingAddress = true,
}: PackingViewProps) {
  const { setScannerInputPlaceholder } = useWmsScanner();
  const wedgeRef = useRef<HTMLInputElement>(null);

  const basketCodeRaw = (detail.basket_code ?? "").trim();
  const cartLabel = (detail.cart_display_code ?? "").trim() || "—";
  const uwagiKlienta = (detail.customer_comment ?? "").trim();
  /** Sztuki spakowane / do spakowania (nie pozycja w kolejce). */
  const packedUnits = Math.max(0, Math.floor(Number(detail.packed_quantity) || 0));
  const totalUnits = Math.max(0, Math.floor(Number(detail.total_quantity) || 0));
  const packerLabel = (packerDisplayName ?? "").trim() || "—";

  const isFullWidth = layoutMode === "full_width";
  const commentHighlighted = customerCommentStyle === "highlighted";
  /** Banner nad produktami tylko w układzie ze sidebarem (w full-width uwagi są w pasie info). */
  const showCommentBanner = !isFullWidth && commentHighlighted && !!uwagiKlienta;
  /** Wyróżniony komentarz → zawsze dokument uproszczony (jak mockup); inaczej ustawienie widoku dokumentu. */
  const effectiveDocumentPreview: PackingSalesDocPreview = commentHighlighted
    ? "simplified"
    : salesDocumentPreview;

  const productCardsClass = packingProductCardsContainerClass();
  const productCardsStyle = packingProductCardsContainerStyle();
  const productCardItemClass = packingProductCardItemClass();
  const productCardItemStyle = packingProductCardItemStyle(productDisplayMode);

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

  const showActivators = Boolean(
    showAutomationButtons && warehouseId != null && warehouseId > 0,
  );
  const activatorsOnTop = showActivators && automationButtonsPosition === "top";
  const activatorsOnBottom = showActivators && automationButtonsPosition === "bottom";

  const automationStrip = showActivators ? (
    <PackingAutomationActivators
      tenantId={DAMAGE_TENANT_ID}
      warehouseId={warehouseId!}
      orderId={detail.order_id}
      showAutomationButtons={showAutomationButtons}
      position={automationButtonsPosition}
      onToast={onAutomationToast}
      onStatusChanged={onAutomationStatusChanged}
    />
  ) : null;

  if (isFullWidth) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
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

        <header className="w-full shrink-0 border-b border-slate-200 bg-white">
          <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4 lg:px-5">
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
              <span
                className="text-2xl font-black tabular-nums text-slate-900 sm:text-3xl"
                title="Spakowane / do spakowania"
              >
                {packedUnits}/{totalUnits}
              </span>
            </div>

            <div className="min-w-0 flex-1 space-y-1 text-sm text-slate-600">
              <PackingCartBasketBadges cartLabel={cartLabel} basketCode={basketCodeRaw} />
              <p className="truncate">
                Osoba pakująca: <span className="font-semibold text-slate-900">{packerLabel}</span>
              </p>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                aria-label="Opcje"
              >
                <IconDots />
              </button>
              <PackingPackAllIconButton
                disabled={scanBusy || packingActionsLocked}
                onClick={() => void packAll()}
              />
            </div>
          </div>
        </header>

        <PackingOrderFullWidthInfo
          detail={detail}
          customerCommentStyle={customerCommentStyle}
          salesDocumentPreview={effectiveDocumentPreview}
          showOrderPhone={showOrderPhone}
          showOrderValue={showOrderValue}
          showShippingAddress={showShippingAddress}
          visibleOperationalNotes={visibleOperationalNotes}
          headerCartons={showHeaderCartonPicker ? headerCartons : []}
          selectedCartonId={selectedCartonId}
          selectCartonBusy={selectCartonBusy}
          packingActionsLocked={packingActionsLocked}
          onSelectCarton={onSelectCarton}
        />

        {activatorsOnTop ? (
          <div
            className="w-full shrink-0 border-b border-slate-200 bg-white px-3 py-2 sm:px-4 lg:px-5"
            data-packing-automation-slot="top"
          >
            {automationStrip}
          </div>
        ) : null}

        <section
          className="min-h-0 w-full flex-1 overflow-y-auto bg-white px-3 pb-4 pt-3 sm:px-4 lg:px-5"
          aria-label="Produkty"
        >
          {detail.bundle_trees && detail.bundle_trees.length > 0 ? (
            <div className="mb-4 w-full">
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
          <ul className={productCardsClass} style={productCardsStyle}>
            {sortedLines.map((line) => {
              const done = line.quantity_packed >= lineQuantityRequired(line);
              const active = !done && activeProductId === line.order_item_id;
              const flash = flashItemId === line.order_item_id;
              return (
                <li key={line.order_item_id} className={productCardItemClass} style={productCardItemStyle}>
                  {done ? (
                    <DoneCard
                      line={line}
                      flash={flash}
                      fieldVisibility={productFieldVisibility}
                      displayMode={productDisplayMode}
                    />
                  ) : active ? (
                    <ActiveCard
                      line={line}
                      packQty={packQty}
                      flash={flash}
                      scanBusy={scanBusy || packingActionsLocked}
                      linePackBusy={linePackBusy}
                      fieldVisibility={productFieldVisibility}
                      displayMode={productDisplayMode}
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
                      displayMode={productDisplayMode}
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

        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-3 py-2 sm:px-4 lg:px-5">
          <button
            type="button"
            className="min-h-11 rounded-lg border-2 border-slate-400 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={onInterrupt}
          >
            Przerwij
          </button>
        </div>
        {activatorsOnBottom ? (
          <div
            className="sticky bottom-0 z-10 flex w-full shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5 sm:px-4 lg:px-5"
            data-packing-automation-slot="bottom"
          >
            {automationStrip}
          </div>
        ) : null}
      </div>
    );
  }

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
        showOrderPhone={showOrderPhone}
        showOrderValue={showOrderValue}
        showShippingAddress={showShippingAddress}
        scanBusy={scanBusy}
        packingActionsLocked={packingActionsLocked}
        visibleOperationalNotes={visibleOperationalNotes}
        packAll={packAll}
        onInterrupt={onInterrupt}
      />

      {/* MAIN — układ ze sidebarem */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="shrink-0 bg-white">
          <div className="flex min-w-0 items-center gap-x-3 gap-y-1 px-3 py-2 sm:gap-x-4 sm:px-4">
            <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 sm:h-10 sm:w-10"
                onClick={() => navigate(WMS_ROUTES.packingOrders)}
                aria-label="Wróć"
              >
                <IconBack />
              </button>
              <span className="whitespace-nowrap text-lg font-bold text-slate-900 sm:text-xl">
                {orderNumberLabel(detail.number)}
              </span>
              <span
                className="whitespace-nowrap text-xl font-black tabular-nums text-slate-900 sm:text-2xl"
                title="Spakowane / do spakowania"
              >
                {packedUnits}/{totalUnits}
              </span>
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <PackingCartBasketBadges cartLabel={cartLabel} basketCode={basketCodeRaw} />
              <span className="hidden text-slate-300 sm:inline" aria-hidden>
                ·
              </span>
              <span className="truncate font-medium">
                Osoba pakująca: <span className="font-semibold text-slate-900">{packerLabel}</span>
              </span>
            </div>

            {showHeaderCartonPicker && headerCartons.length > 0 ? (
              <div className="ml-auto flex shrink-0 items-center self-center">
                <PackingRecommendedCartonsPanel
                  items={headerCartons}
                  selectedId={selectedCartonId ?? detail.selected_carton_id}
                  busy={selectCartonBusy || packingActionsLocked}
                  onSelect={onSelectCarton}
                />
              </div>
            ) : null}
          </div>
        </header>

        {showCommentBanner ? <PackingCustomerCommentBanner comment={uwagiKlienta} /> : null}

        {activatorsOnTop ? (
          <div
            className="shrink-0 border-b border-slate-200 bg-white px-3 py-2"
            data-packing-automation-slot="top"
          >
            {automationStrip}
          </div>
        ) : null}

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
          <ul className={productCardsClass} style={productCardsStyle}>
            {sortedLines.map((line) => {
              const done = line.quantity_packed >= lineQuantityRequired(line);
              const active = !done && activeProductId === line.order_item_id;
              const flash = flashItemId === line.order_item_id;
              return (
                <li key={line.order_item_id} className={productCardItemClass} style={productCardItemStyle}>
                  {done ? (
                    <DoneCard
                      line={line}
                      flash={flash}
                      fieldVisibility={productFieldVisibility}
                      displayMode={productDisplayMode}
                    />
                  ) : active ? (
                    <ActiveCard
                      line={line}
                      packQty={packQty}
                      flash={flash}
                      scanBusy={scanBusy || packingActionsLocked}
                      linePackBusy={linePackBusy}
                      fieldVisibility={productFieldVisibility}
                      displayMode={productDisplayMode}
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
                      displayMode={productDisplayMode}
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
        {activatorsOnBottom ? (
          <div
            className="sticky bottom-0 z-10 shrink-0 border-t border-slate-200 bg-white px-3 py-2.5"
            data-packing-automation-slot="bottom"
          >
            {automationStrip}
          </div>
        ) : null}
      </div>
    </div>
  );
}
