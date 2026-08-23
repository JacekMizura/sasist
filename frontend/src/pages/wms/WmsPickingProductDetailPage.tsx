import axios from "axios";
import { Bell, Eye, Hand, PackageMinus, ShoppingCart, MapPin, AlertTriangle, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  formatFastApiErrorDetail,
  getWmsPickingProductDetail,
  getWmsPickingProductPicks,
  postWmsPickingAcceptSourceLocation,
  postWmsPickingConfirmBasketPut,
  postWmsPickingConfirmEmptyLocation,
  postWmsPickingConfirmRemaining,
  postWmsPickingQuickPick,
  postWmsPickingReportShortage,
  postWmsPickingReportShortageBulk,
  postWmsPickingUndoPick,
  postWmsPickingUndoPickById,
  type WmsPickingDraftPickApi,
  type WmsPickingProductDetailApi,
  type WmsPickingProductLocationRowApi,
} from "../../api/wmsPickingProductsApi";
import { postStageConsolidationItem } from "../../api/wmsConsolidationApi";
import { useMergedPickingSession, useWmsPickingCart } from "../../context/WmsPickingCartContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { isCartlessPickingSession } from "./wmsPickingSessionKind";
import {
  looksLikePickingCartCode,
  scanMatchesAssignedCart,
} from "./wmsPickingStatusSession";
import { BundlePickingOrderTree } from "../../components/wms/picking/BundlePickingOrderTree";
import { BundlePickingScanCard } from "../../components/wms/bundle/BundlePickingScanCard";
import { BundleConsolidationRackCard } from "../../components/wms/bundle/BundleConsolidationRackCard";
import {
  BasketPutQuantityModal,
  type BasketPutQuantityDraft,
} from "../../components/wms/picking/BasketPutQuantityModal";
import { AppOverlayPortal } from "../../components/overlay";
import { OrderPriorityFlameIcon } from "../../components/orders/OrderPriorityFlame";
import { MultiBasketAllocationPanel } from "./picking-detail/MultiBasketAllocationPanel";
import { MultiAllocationShortageModal } from "./picking-detail/MultiAllocationShortageModal";
import { MultiBulkShortageModal } from "./picking-detail/MultiBulkShortageModal";
import type { BundleScanOut, ConsolidationRackBundleRowOut } from "../../api/bundlesLogisticsApi";
import { getConsolidationRackBundleView } from "../../api/bundlesLogisticsApi";
import { tryPickingBundleScan } from "../../services/bundleScannerIntegration";
import { formatWmsPickingLocationPillLabel } from "./wmsPickingLocationPill";
import { PickingSimpleHeader } from "../../components/wms/picking/PickingSimpleHeader";
import {
  PickingEanBadge,
  PickingFieldLabel,
  PickingLocationBadge,
  PickingQtyPair,
  PickingShortageBadge,
} from "../../components/wms/picking/PickingUiPrimitives";
import { PickingOptionsSheet, PickingStickyFooter } from "../../components/wms/picking/PickingStickyChrome";
import { PickingQtyPanel } from "../../components/wms/picking/PickingQtyPanel";
import { PickingProcessAlert } from "../../components/wms/picking/PickingProcessAlert";
import { PICKING_CARD_CLASS } from "../../components/wms/picking/pickingUiTokens";
import { wmsTypoClass } from "../../wms/typography/wmsOperatorTypography";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import {
  looksLikeProductBarcode,
  multiScanTrace,
  resolveMultiPickingDetailScan,
} from "../../utils/multiPickingScanRoute";
import { nextActiveLocationIdAfterDetail } from "../../utils/multiPickingActiveLocation";
import {
  isServerSourceAccepted,
  mayAcceptOrReacceptSource,
  serverSourceLocationId,
} from "../../utils/multiPickingSourceAcceptance";
import { SCAN_CONSUMED } from "../../utils/wmsScanDispatch";
import {
  extractWmsScanErrorDetail,
  mapWmsScanErrorCode,
} from "../../wms/scanFeedback/wmsScanErrorCatalog";
import { buildPickingBundleDisplay } from "../../utils/bundleScanFlow";
import { WmsOperationalPageBody, WmsOperationalPageShell } from "../../components/wms/execution/WmsOperationalPageShell";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { playScanBeep } from "../../utils/playScanBeep";
import { dispatchWmsShortagesUpdated } from "../../utils/wmsRefresh";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { ShippingMethodLogo } from "../../components/shipping/ShippingMethodLogo";
import type { WmsPickingProductsNavState } from "./wmsPickingFlowTypes";
import { resolveWmsPickingTenantId } from "./wmsPickingTenant";
import { WMS_ROUTES } from "./wmsRoutes";
import {
  applyWmsPickingShortageToDetail,
  cannotReportPickingShortage,
  polishOrdersWithShortagesLabel,
  wmsPickingEffectivePickedQuantity,
  wmsPickingLineResolutionStatus,
  wmsPickingRemainingQty,
  wmsPickingShortageDefaultQty,
} from "./wmsPickingUiGates";
import { pageContainerWidthAlignClass } from "../../components/layout/PageContainer";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { getWmsPickingTerminalSettings } from "../../api/wmsPickingTerminalSettingsApi";
import {
  DEFAULT_PICKING_TERMINAL_SCAN_POLICY,
  productHasScannableCode,
  productMatchesScanCode,
  resolveAutoSourceLocationId,
  resolvePickingValidationGates,
  type PickingTerminalScanPolicy,
} from "../../modules/wmsSettings/picking/pickingTerminalScanPolicy";
import {
  formatWrongLocationMessage,
  locationRowMatchesScan,
  resolvePickingSourceLocationScan,
} from "../../utils/pickingLocationScan";

const BASKET_PUT_STYLE_RING: readonly string[] = [
  "border-violet-500 bg-violet-100/95 text-violet-950 ring-2 ring-violet-400/50",
  "border-sky-500 bg-sky-100/95 text-sky-950 ring-2 ring-sky-400/50",
  "border-emerald-500 bg-emerald-100/95 text-emerald-950 ring-2 ring-emerald-400/50",
  "border-amber-500 bg-amber-100/95 text-amber-950 ring-2 ring-amber-400/50",
  "border-rose-500 bg-rose-100/95 text-rose-950 ring-2 ring-rose-400/50",
  "border-indigo-500 bg-indigo-100/95 text-indigo-950 ring-2 ring-indigo-400/50",
  "border-teal-500 bg-teal-100/95 text-teal-950 ring-2 ring-teal-400/50",
  "border-fuchsia-500 bg-fuchsia-100/95 text-fuchsia-950 ring-2 ring-fuchsia-400/50",
];

function basketStyleIndexForLabel(label: string | null | undefined): number {
  const s = (label ?? "").trim();
  if (!s) return 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h) % BASKET_PUT_STYLE_RING.length;
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

function locStock(loc: { stock_quantity?: number }): number {
  const q = loc.stock_quantity;
  return typeof q === "number" && Number.isFinite(q) ? q : 0;
}

function locationMatchesScan(loc: WmsPickingProductLocationRowApi, scan: string): boolean {
  return locationRowMatchesScan(loc, scan);
}

function ModalShell({
  title,
  children,
  onClose,
  closeDisabled = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  const requestClose = () => {
    if (closeDisabled) return;
    onClose();
  };
  return (
    <AppOverlayPortal>
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wms-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="max-h-[min(92vh,720px)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <h2 id="wms-modal-title" className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={requestClose} disabled={closeDisabled} className="min-h-[44px] min-w-[44px] rounded-xl text-sm font-semibold text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-950 disabled:opacity-40">Zamknij</button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
    </AppOverlayPortal>
  );
}

export default function WmsPickingProductDetailPage() {
  const { productId: productIdParam } = useParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { snapshot: pickingCartSnapshot } = useWmsPickingCart();
  const pickingTenantId = useMemo(() => resolveWmsPickingTenantId(warehouseId, pickingCartSnapshot), [warehouseId, pickingCartSnapshot]);
  const { registerScanHandler, setScannerInputPlaceholder, appendScanToHistory, refocusScannerInput, showScannerToast, showScanFeedbackFromCode, showScanFeedback } = useWmsScanner();

  const pickingSessionRaw = (routerLocation.state as WmsPickingProductsNavState | null)?.pickingSession ?? null;
  const listProductScanToken =
    (routerLocation.state as WmsPickingProductsNavState | null)?.listProductScanToken ?? null;
  const basketPutPendingSeed =
    (routerLocation.state as WmsPickingProductsNavState | null)?.basketPutPendingSeed ?? null;
  const navigationSourceFromRouter =
    (routerLocation.state as WmsPickingProductsNavState | null)?.navigationSource ?? null;
  const highlightPickIdFromNav =
    (routerLocation.state as WmsPickingProductsNavState | null)?.highlightPickId ?? null;
  const enteredViaListProductScan = Boolean(listProductScanToken || basketPutPendingSeed);
  const [productScanSatisfied, setProductScanSatisfied] = useState(enteredViaListProductScan);
  /** True only after explicit location scan when policy requires it (not auto single-loc). */
  const [locationScanSatisfied, setLocationScanSatisfied] = useState(false);
  const [terminalPolicy, setTerminalPolicy] = useState<PickingTerminalScanPolicy>(
    DEFAULT_PICKING_TERMINAL_SCAN_POLICY,
  );
  const [terminalPolicyErr, setTerminalPolicyErr] = useState<string | null>(null);

  useEffect(() => {
    setProductScanSatisfied(enteredViaListProductScan);
    setLocationScanSatisfied(false);
  }, [enteredViaListProductScan, productIdParam]);

  useEffect(() => {
    if (warehouseId == null) {
      setTerminalPolicy(DEFAULT_PICKING_TERMINAL_SCAN_POLICY);
      setTerminalPolicyErr(null);
      return;
    }
    let cancelled = false;
    void getWmsPickingTerminalSettings(pickingTenantId, warehouseId)
      .then((t) => {
        if (cancelled) return;
        setTerminalPolicyErr(null);
        setTerminalPolicy({
          requireProductScanAtLeastOnce: Boolean(t.require_product_scan_at_least_once),
          requireLocationScan: Boolean(t.require_location_scan),
          disableForceLocationScanWhenManyLocations: Boolean(
            t.disable_force_location_scan_when_many_locations,
          ),
          allowReserveLocationPicking: Boolean(t.allow_reserve_location_picking),
          allowProductsWithoutEan: Boolean(t.allow_products_without_ean),
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Do not mask 401/auth failures with silent defaults — keep previous policy and surface error.
        const msg = extractApiErrorMessage(e) || "Nie udało się wczytać ustawień terminala zbierania.";
        setTerminalPolicyErr(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [warehouseId, pickingTenantId]);

  /** Prefer explicit router source; fall back to seed/token heuristic for older navigations. */
  const navigationSource =
    navigationSourceFromRouter ??
    (enteredViaListProductScan ? "physical_scan" : "click");
  const pickingSession = useMergedPickingSession(pickingSessionRaw, pickingTenantId, warehouseId);
  const orderType = pickingSession?.orderTypeChoice ?? "all";
  const recoveryOrderId = pickingSession?.recoveryOrderId ?? null;
  const productId = Number(productIdParam);

  const [detail, setDetail] = useState<WmsPickingProductDetailApi | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pickQty, setPickQty] = useState(1);
  const [pickBusy, setPickBusy] = useState(false);
  const [pickMsg, setPickMsg] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<number | null>(null);
  /** Locations the operator accepted this product visit (continuous re-accept after put). */
  const lastOperatorAcceptedLocationRef = useRef<number | null>(null);
  /** Explicit scan/tap this visit — not bare preserved activeLocationId after reload. */
  const explicitSourceSelectionRef = useRef<number | null>(null);
  const sourceAcceptInFlightRef = useRef(false);
  const [locationHint, setLocationHint] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [qtyStepOpen, setQtyStepOpen] = useState(false);
  const [qtyStepValue, setQtyStepValue] = useState(1);
  const [multiLocAlertOpen, setMultiLocAlertOpen] = useState(false);
  const [processAlert, setProcessAlert] = useState<string | null>(null);
  const [manualLocId, setManualLocId] = useState<number | null>(null);
  const [manualQty, setManualQty] = useState(1);
  const [taskOpen, setTaskOpen] = useState(false);
  const [shortageConfirmOpen, setShortageConfirmOpen] = useState(false);
  const [shortageBusy, setShortageBusy] = useState(false);
  const [shortageErr, setShortageErr] = useState<string | null>(null);
  const [shortageQtyInput, setShortageQtyInput] = useState(1);
  /** empty_location | qty_mismatch | product_shortage */
  const [shortageProblemKind, setShortageProblemKind] = useState<"empty_location" | "qty_mismatch" | "product_shortage">(
    "product_shortage",
  );
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoBusyPickId, setUndoBusyPickId] = useState<number | null>(null);
  const [draftPicks, setDraftPicks] = useState<WmsPickingDraftPickApi[]>([]);
  const [draftPicksLoading, setDraftPicksLoading] = useState(false);
  const [highlightPickId, setHighlightPickId] = useState<number | null>(null);
  const [depositBusy, setDepositBusy] = useState(false);
  const [bundlePickScan, setBundlePickScan] = useState<BundleScanOut | null>(null);
  const [consolidationRackRows, setConsolidationRackRows] = useState<ConsolidationRackBundleRowOut[]>([]);
  const [quantityDraft, setQuantityDraft] = useState<BasketPutQuantityDraft | null>(null);
  /** MULTI path A/B: shortage scoped to one order_item. */
  const [multiShortageOpen, setMultiShortageOpen] = useState(false);
  const [bulkShortageOpen, setBulkShortageOpen] = useState(false);
  const [multiShortageOrderItemId, setMultiShortageOrderItemId] = useState<number | null>(null);
  const [multiShortageQty, setMultiShortageQty] = useState<number | null>(null);
  /** After partial put: offer mark-remaining-shortage for that allocation. */
  const [postPutFollowUp, setPostPutFollowUp] = useState<{
    orderItemId: number;
    basketLabel: string;
    remaining: number;
  } | null>(null);

  const detailLoadSeqRef = useRef(0);
  /** Strip one-shot list→detail markers from history (no second PRODUCT_SCAN). */
  const listScanConsumedRef = useRef<string | null>(null);
  /** Pending projection from list PRODUCT_SCAN response until GET confirms SSOT. */
  const [pendingSeed, setPendingSeed] = useState<WmsPickingProductsNavState["basketPutPendingSeed"]>(() =>
    basketPutPendingSeed && basketPutPendingSeed.product_id === productId ? basketPutPendingSeed : null,
  );
  /** Serialize physical scans — blocks rapid double Enter / parallel Pick. */
  const scanGateRef = useRef(false);

  const fetchProductDetail = useCallback(async (opts?: { force?: boolean }): Promise<WmsPickingProductDetailApi | null> => {
    if (warehouseId == null || !pickingSession || !Number.isFinite(productId) || productId <= 0) return null;
    return getWmsPickingProductDetail(
      pickingTenantId,
      warehouseId,
      pickingSession.orderUiStatusId,
      orderType,
      productId,
      isCartlessPickingSession(pickingSession) ? null : pickingSession.cartId ?? null,
      recoveryOrderId,
      undefined,
      {
        force: opts?.force === true,
        pickingSessionId: isCartlessPickingSession(pickingSession)
          ? pickingSession.pickingSessionId ?? null
          : null,
      },
    );
  }, [warehouseId, pickingSession, orderType, productId, pickingTenantId, recoveryOrderId]);

  const applyDetailToState = useCallback((d: WmsPickingProductDetailApi) => {
    setDetail(d);
    const rem = wmsPickingRemainingQty(d);
    setPickQty(rem > 0 ? rem : 0);
    setShortageQtyInput(wmsPickingShortageDefaultQty(d));
    if (d.basket_put_pending) {
      setPendingSeed(null);
    }
  }, []);

  const effectivePending = detail?.requires_basket_put_confirm
    ? null
    : detail?.basket_put_pending ?? (pendingSeed ? {
    product_id: pendingSeed.product_id ?? productId,
    quantity: pendingSeed.quantity ?? 1,
    idempotency_key: pendingSeed.idempotency_key,
    eligible_baskets: pendingSeed.eligible_baskets,
  } : null);

  const refreshDetailSilently = useCallback(async () => {
    try {
      const d = await fetchProductDetail({ force: true });
      if (d) applyDetailToState(d);
    } catch {}
  }, [fetchProductDetail, applyDetailToState]);

  const load = useCallback(async (): Promise<WmsPickingProductDetailApi | null> => {
    if (warehouseId == null || !pickingSession || !Number.isFinite(productId) || productId <= 0) {
      setDetail(null);
      return null;
    }
    const seq = ++detailLoadSeqRef.current;
    setLoading(true);
    setErr(null);
    try {
      // Always force — detail must load live orders/locations (no stale dedupe after list).
      const d = await fetchProductDetail({ force: true });
      if (seq !== detailLoadSeqRef.current) return null;
      if (!d) {
        setErr("Nie udało się wczytać szczegółów produktu.");
        setDetail(null);
        return null;
      }
      applyDetailToState(d);
      return d;
    } catch (e: unknown) {
      if (seq !== detailLoadSeqRef.current) return null;
      setErr(extractApiErrorMessage(e) || "Nie udało się wczytać szczegółów produktu.");
      setDetail(null);
      return null;
    } finally {
      if (seq === detailLoadSeqRef.current) setLoading(false);
    }
  }, [warehouseId, pickingSession, productId, fetchProductDetail, applyDetailToState]);

  useEffect(() => {
    if (!pickingSessionRaw) {
      navigate(WMS_ROUTES.picking, { replace: true });
      return;
    }
    void load();
  }, [pickingSessionRaw, navigate, load]);

  // Clear one-shot list token from history. Keep pending seed until GET confirms SSOT.
  useEffect(() => {
    if (!listProductScanToken) return;
    if (listScanConsumedRef.current === listProductScanToken) return;
    listScanConsumedRef.current = listProductScanToken;
    navigate(".", {
      replace: true,
      state: {
        pickingSession: pickingSessionRaw,
        ...(navigationSourceFromRouter ? { navigationSource: navigationSourceFromRouter } : {}),
        ...(pendingSeed ? { basketPutPendingSeed: pendingSeed } : {}),
      } satisfies WmsPickingProductsNavState,
    });
  }, [listProductScanToken, pendingSeed, navigate, pickingSessionRaw, navigationSourceFromRouter]);

  useEffect(() => {
    if (highlightPickIdFromNav != null && Number(highlightPickIdFromNav) > 0) {
      setHighlightPickId(Number(highlightPickIdFromNav));
    }
  }, [highlightPickIdFromNav]);

  const reloadDraftPicks = useCallback(async () => {
    if (
      warehouseId == null ||
      !pickingSession?.cartId ||
      !Number.isFinite(productId) ||
      productId <= 0 ||
      !detail?.requires_basket_put_confirm
    ) {
      setDraftPicks([]);
      return;
    }
    setDraftPicksLoading(true);
    try {
      const res = await getWmsPickingProductPicks(
        pickingTenantId,
        warehouseId,
        pickingSession.cartId,
        productId,
      );
      setDraftPicks(Array.isArray(res.picks) ? res.picks : []);
    } catch {
      setDraftPicks([]);
    } finally {
      setDraftPicksLoading(false);
    }
  }, [warehouseId, pickingSession?.cartId, productId, detail?.requires_basket_put_confirm, pickingTenantId]);

  useEffect(() => {
    void reloadDraftPicks();
  }, [reloadDraftPicks, detail]);

  useEffect(() => {
    if (!detail) return;
    setLocationHint(null);
    const serverLid = serverSourceLocationId(detail.source_lock, productId);
    setActiveLocationId((prev) => {
      const next = nextActiveLocationIdAfterDetail({
        previousId: prev,
        locations: detail.locations,
        productChanged: false,
        serverSourceLocationId: serverLid,
      });
      // Single-shelf auto: treat as explicit so accept may run without physical re-scan.
      if (next != null && detail.locations.length === 1) {
        explicitSourceSelectionRef.current = next;
      }
      return next;
    });
    if (serverLid != null) {
      lastOperatorAcceptedLocationRef.current = serverLid;
      multiScanTrace("SOURCE_LOCK_STATE_FROM_DETAIL", {
        product_id: productId,
        location_id: serverLid,
        message: "Serwer ma zatwierdzoną lokalizację źródłową",
      });
    }
  }, [detail, productId]);

  // New product → clear source location (never carry A23 into another SKU).
  useEffect(() => {
    setActiveLocationId(null);
    setLocationHint(null);
    lastOperatorAcceptedLocationRef.current = null;
    explicitSourceSelectionRef.current = null;
  }, [productId]);

  const acceptSourceLocation = useCallback(
    async (
      locationId: number,
      mode: "accept" | "reaccept" = "accept",
    ): Promise<boolean> => {
      if (!detail?.requires_basket_put_confirm || !pickingSession?.cartId) {
        return true;
      }
      if (!Number.isFinite(locationId) || locationId <= 0) return false;
      const eventReq = mode === "reaccept" ? "SOURCE_REACCEPT_REQUEST" : "SOURCE_ACCEPT_REQUEST";
      const eventOk = mode === "reaccept" ? "SOURCE_REACCEPT_OK" : "SOURCE_ACCEPT_OK";
      const eventFail = mode === "reaccept" ? "SOURCE_REACCEPT_FAIL" : "SOURCE_ACCEPT_FAIL";
      multiScanTrace(eventReq, {
        product_id: productId,
        location_id: locationId,
        cart_id: pickingSession.cartId,
        message:
          mode === "reaccept"
            ? "Ponowne zatwierdzenie tej samej lokalizacji (ciągły flow)"
            : "Zatwierdzanie lokalizacji źródłowej",
      });
      sourceAcceptInFlightRef.current = true;
      try {
        const res = await postWmsPickingAcceptSourceLocation(pickingTenantId, warehouseId, {
          cart_id: pickingSession.cartId,
          product_id: productId,
          location_id: locationId,
        });
        lastOperatorAcceptedLocationRef.current = locationId;
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                source_lock: {
                  ...(prev.source_lock ?? {}),
                  ...(typeof res.source_lock === "object" && res.source_lock
                    ? (res.source_lock as Record<string, unknown>)
                    : {}),
                  product_id: productId,
                  location_id: locationId,
                  cart_id: pickingSession.cartId,
                },
              }
            : prev,
        );
        multiScanTrace(eventOk, {
          product_id: productId,
          location_id: locationId,
          message: "Lokalizacja źródłowa zatwierdzona na serwerze",
        });
        return true;
      } catch (e) {
        const mapped = extractWmsScanErrorDetail(e);
        const fb = mapWmsScanErrorCode(mapped.code, { backendMessage: mapped.message });
        multiScanTrace(eventFail, {
          product_id: productId,
          location_id: locationId,
          code: mapped.code,
          message: mapped.message ?? fb.message,
        });
        showScanFeedbackFromCode(mapped.code, { contextHint: mapped.message });
        setPickMsg(fb.message);
        setActiveLocationId(null);
        explicitSourceSelectionRef.current = null;
        return false;
      } finally {
        sourceAcceptInFlightRef.current = false;
      }
    },
    [
      detail?.requires_basket_put_confirm,
      pickingSession?.cartId,
      pickingTenantId,
      warehouseId,
      productId,
      showScanFeedbackFromCode,
    ],
  );

  const ensureServerSourceForBasket = useCallback(
    async (locationId: number): Promise<boolean> => {
      if (!detail?.requires_basket_put_confirm) return true;
      if (isServerSourceAccepted(detail.source_lock, productId, locationId)) {
        return true;
      }
      const singleId =
        detail.locations.length === 1 ? detail.locations[0]?.location_id ?? null : null;
      const allowed = mayAcceptOrReacceptSource({
        locationId,
        lastOperatorAcceptedLocationId: lastOperatorAcceptedLocationRef.current,
        explicitSelectionLocationId: explicitSourceSelectionRef.current,
        locationCount: detail.locations.length,
        singleLocationId: singleId,
      });
      if (!allowed) {
        multiScanTrace("SOURCE_LOCK_BLOCKED", {
          product_id: productId,
          location_id: locationId,
          message:
            "Brak ciągłego flow ani jawnego wyboru lokalizacji — nie tworzę source_lock z samego activeLocationId",
        });
        return false;
      }
      const continuous = lastOperatorAcceptedLocationRef.current === locationId;
      return acceptSourceLocation(locationId, continuous ? "reaccept" : "accept");
    },
    [detail, productId, acceptSourceLocation],
  );

  // Continuous re-accept after successful put: UI kept location, server cleared lock.
  useEffect(() => {
    if (!detail?.requires_basket_put_confirm) return;
    if (activeLocationId == null) return;
    if (isServerSourceAccepted(detail.source_lock, productId, activeLocationId)) return;
    if (sourceAcceptInFlightRef.current) return;
    if (lastOperatorAcceptedLocationRef.current !== activeLocationId) return;
    void acceptSourceLocation(activeLocationId, "reaccept");
  }, [
    activeLocationId,
    detail?.requires_basket_put_confirm,
    detail?.source_lock,
    productId,
    acceptSourceLocation,
  ]);

  const validationGates = useMemo(() => {
    const hasCode = productHasScannableCode({
      ean: detail?.ean,
      sku: detail?.sku,
      barcode: detail?.barcode,
    });
    return resolvePickingValidationGates({
      locationCount: detail?.locations.length ?? 0,
      policy: terminalPolicy,
      hasScannableProductCode: hasCode,
    });
  }, [detail?.ean, detail?.sku, detail?.barcode, detail?.locations.length, terminalPolicy]);

  const needsLocationScan = validationGates.needsLocationScan;
  const productScanRequired =
    validationGates.needsProductScan && !productScanSatisfied;
  const locationScanRequired =
    needsLocationScan && !locationScanSatisfied;
  const productBlockedWithoutCode = validationGates.productBlockedWithoutCode;

  // When location scan is not required, auto-select concrete source (routing order).
  useEffect(() => {
    if (!detail || needsLocationScan) return;
    if (activeLocationId != null) {
      setLocationScanSatisfied(true);
      return;
    }
    const autoId = resolveAutoSourceLocationId({
      needsLocationScan: false,
      locations: detail.locations,
    });
    if (autoId != null) {
      setActiveLocationId(autoId);
      setLocationScanSatisfied(true);
      explicitSourceSelectionRef.current = autoId;
    }
  }, [detail, needsLocationScan, activeLocationId]);

  const selectedLocation = useMemo(() => {
    if (!detail || activeLocationId == null) return undefined;
    return detail.locations.find((l) => l.location_id === activeLocationId);
  }, [detail, activeLocationId]);

  const expectedLocationBadge = useMemo(() => {
    if (!detail) return "";
    const loc =
      selectedLocation ??
      (detail.locations.length === 1 ? detail.locations[0] : undefined);
    if (!loc) return "";
    return formatWmsPickingLocationPillLabel(
      loc.location_code,
      locStock(loc) > 1e-9 ? locStock(loc) : undefined,
    );
  }, [detail, selectedLocation]);

  const productMatchesScan = useCallback(
    (scan: string) =>
      productMatchesScanCode(
        scan,
        {
          ean: detail?.ean,
          sku: detail?.sku,
          barcode: detail?.barcode,
          productId: detail?.product_id,
        },
        normalizeScanEan,
      ),
    [detail],
  );

  const missingTotal = useMemo(() => {
    if (!detail) return 0;
    const m = detail.missing_quantity;
    return typeof m === "number" && Number.isFinite(m) ? Math.max(0, m) : 0;
  }, [detail]);

  const displayPickedDetail = useMemo(() => {
    if (!detail) return 0;
    return wmsPickingEffectivePickedQuantity(detail);
  }, [detail]);

  const remaining = useMemo(() => {
    if (!detail) return 0;
    return wmsPickingRemainingQty(detail);
  }, [detail]);

  const toPickTotal = remaining;
  const pickQueueDone = detail != null && remaining <= 1e-9;
  const resolutionStatus = useMemo(
    () => (detail ? wmsPickingLineResolutionStatus(detail) : "ACTIVE"),
    [detail],
  );
  const isShortageResolved = resolutionStatus === "SHORTAGE";

  /** Bieżąca lokalizacja pobrania na ekranie ilości: skan / wybór / jedyna lokalizacja. */
  const qtySourceLocationId = useMemo(() => {
    if (!detail) return null;
    const fromState = manualLocId ?? activeLocationId;
    if (fromState != null && fromState > 0) return fromState;
    if (detail.locations.length === 1) {
      const only = detail.locations[0]?.location_id;
      return only != null && only > 0 ? only : null;
    }
    return null;
  }, [detail, manualLocId, activeLocationId]);

  const qtySourceLocationLabel = useMemo(() => {
    if (!detail || qtySourceLocationId == null) return "";
    const loc = detail.locations.find((l) => l.location_id === qtySourceLocationId);
    if (!loc) return "";
    return formatWmsPickingLocationPillLabel(
      loc.location_code,
      locStock(loc) > 1e-9 ? locStock(loc) : undefined,
    );
  }, [detail, qtySourceLocationId]);

  const openQtyStep = useCallback(
    (locId: number) => {
      if (!detail || locId <= 0) return;
      if (detail.requires_basket_put_confirm) return;
      if (pickQueueDone || isShortageResolved) return;
      if (productBlockedWithoutCode) {
        showScanFeedbackFromCode("PRODUCT_WITHOUT_SCAN_CODE_BLOCKED");
        setPickMsg(mapWmsScanErrorCode("PRODUCT_WITHOUT_SCAN_CODE_BLOCKED").message);
        return;
      }
      if (productScanRequired) {
        showScanFeedbackFromCode("PRODUCT_SCAN_REQUIRED");
        setPickMsg(mapWmsScanErrorCode("PRODUCT_SCAN_REQUIRED").message);
        setScannerInputPlaceholder("Zeskanuj produkt");
        return;
      }
      if (needsLocationScan && !locationScanSatisfied && explicitSourceSelectionRef.current !== locId) {
        showScanFeedbackFromCode("PICK_LOCATION_REQUIRED");
        setPickMsg(mapWmsScanErrorCode("PICK_LOCATION_REQUIRED").message);
        return;
      }
      setManualLocId(locId);
      setActiveLocationId(locId);
      const rem = wmsPickingRemainingQty(detail);
      setQtyStepValue(rem > 0 ? Math.min(1, rem) : 0);
      setQtyStepOpen(true);
    },
    [
      detail,
      pickQueueDone,
      isShortageResolved,
      productBlockedWithoutCode,
      productScanRequired,
      needsLocationScan,
      locationScanSatisfied,
      showScanFeedbackFromCode,
    ],
  );

  useEffect(() => {
    if (!detail) return;
    if (
      needsLocationScan &&
      activeLocationId == null &&
      detail.locations.length > 1 &&
      remaining > 1e-9 &&
      resolutionStatus !== "SHORTAGE" &&
      resolutionStatus !== "COMPLETED_PICK"
    ) {
      setMultiLocAlertOpen(true);
    }
  }, [
    detail?.product_id,
    detail?.locations.length,
    needsLocationScan,
    activeLocationId,
    remaining,
    resolutionStatus,
  ]);

  const shortageLocationLabel = useMemo(() => {
    if (!detail?.locations?.length) return "—";
    const code = selectedLocation?.location_code ?? detail.locations[0]?.location_code;
    return (code && String(code).trim()) || "—";
  }, [detail, selectedLocation]);

  const fullyPickedNoMissing = pickQueueDone && missingTotal <= 1e-9;

  const reportShortageBlocked = useMemo(
    () =>
      cannotReportPickingShortage({
        remaining,
        cartId: pickingSession?.cartId,
        pickingSessionId: pickingSession?.pickingSessionId,
        pickedQuantity: displayPickedDetail,
      }),
    [remaining, pickingSession?.cartId, pickingSession?.pickingSessionId, displayPickedDetail],
  );
  const canUndoPick =
    Boolean(pickingSession?.cartId) && displayPickedDetail > 1e-9 && missingTotal <= 1e-9;
  const ordersWithShortageCount = useMemo(() => {
    if (!detail?.orders?.length) return 0;
    return detail.orders.filter((o) => (o.missing_quantity ?? 0) > 1e-9).length;
  }, [detail]);

  useEffect(() => {
    if (!detail) return;
    if (detail.requires_basket_put_confirm) {
      if (needsLocationScan && activeLocationId == null) {
        setScannerInputPlaceholder("Zeskanuj lokalizację");
      } else if (productScanRequired) {
        setScannerInputPlaceholder("Zeskanuj produkt");
      } else {
        setScannerInputPlaceholder("Zeskanuj koszyk");
      }
      setPendingSeed(null);
    } else if (effectivePending) {
      setScannerInputPlaceholder("Zeskanuj koszyk");
    } else if (needsLocationScan && activeLocationId == null) {
      setScannerInputPlaceholder("Zeskanuj lokalizację");
    } else if (productScanRequired) {
      setScannerInputPlaceholder("Zeskanuj produkt");
    } else if (detail.basket_put_active_series?.basket_label) {
      setScannerInputPlaceholder("Skanuj EAN produktu");
    } else {
      setScannerInputPlaceholder("Skanuj EAN produktu");
    }
    refocusScannerInput();
  }, [
    detail,
    needsLocationScan,
    productScanRequired,
    activeLocationId,
    setScannerInputPlaceholder,
    refocusScannerInput,
    effectivePending,
    detail?.basket_put_active_series,
    detail?.requires_basket_put_confirm,
  ]);

  useEffect(() => {
    multiScanTrace("DETAIL_MOUNT", {
      product_id: productId,
      has_seed: Boolean(pendingSeed),
      navigation_source: navigationSource,
      entered_via_list_product_scan: enteredViaListProductScan,
      has_token: Boolean(listProductScanToken),
    });
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!detail) return;
    multiScanTrace("DETAIL_STATE_LOADED", {
      product_id: productId,
      pending_after: Boolean(detail.basket_put_pending || pendingSeed),
      get_pending: Boolean(detail.basket_put_pending),
      seed_pending: Boolean(pendingSeed),
      requires_basket_put: Boolean(detail.requires_basket_put_confirm),
      cart_id: pickingSession?.cartId ?? null,
    });
  }, [detail, pendingSeed, productId, pickingSession?.cartId]);

  // LOGIKA ODZNACZANIA KOLEJNYCH SZTUK W DETALU POPRZEZ FIZYCZNY SKAN
  useEffect(() => {
    // Keep handler alive during load when seed says STATE B (list PRODUCT_SCAN already done).
    if (!pickingSession) {
      registerScanHandler(null);
      return;
    }
    if (!detail && !pendingSeed) {
      registerScanHandler(null);
      return;
    }
    const handler = async (raw: string) => {
      const scan = normalizeScanEan(raw);
      if (!scan) return SCAN_CONSUMED;
      if (scanGateRef.current || pickBusy) {
        multiScanTrace("DETAIL_SCAN_BUSY", { raw_code: scan, consumed: true });
        return SCAN_CONSUMED;
      }

      // Własny wózek na szczegółach = już w sesji — cichy accept, bez resolve-cart / „masz już…”.
      if (
        looksLikePickingCartCode(scan) ||
        scanMatchesAssignedCart(scan, {
          cartCode: pickingSession.cartCode,
          cartName: pickingSession.cartName,
          cartId: pickingSession.cartId,
        })
      ) {
        appendScanToHistory(scan);
        const own = scanMatchesAssignedCart(scan, {
          cartCode: pickingSession.cartCode,
          cartName: pickingSession.cartName,
          cartId: pickingSession.cartId,
        });
        if (own) {
          playScanBeep();
          return SCAN_CONSUMED;
        }
        showScannerToast(
          "Masz aktywną sesję zbierania. Kontynuuj skanowanie produktu albo anuluj zbieranie.",
        );
        return SCAN_CONSUMED;
      }

      // Seed-only (detail still loading): allow basket confirm path via route STATE B.
      const locs = detail?.locations ?? [];
      if (detail && locs.length === 0) return SCAN_CONSUMED;

      const requiresBasketPut = Boolean(
        (detail?.requires_basket_put_confirm ?? enteredViaListProductScan) && pickingSession.cartId,
      );
      const pendingLabels =
        effectivePending?.eligible_baskets
          ?.map((b) => b.basket_label)
          .filter(Boolean)
          .join(", ") || undefined;

      // SOURCE location: always resolve location_like against route-allowed locs (SSOT).
      // Never silently consume a wrong location while Helper history shows it as accepted.
      if (detail && locs.length > 0) {
        const expectedCode =
          (selectedLocation?.location_code ?? "").trim() ||
          (locs.length === 1 ? (locs[0].location_code ?? "").trim() : "") ||
          (expectedLocationBadge || "").trim() ||
          null;
        const locRes = resolvePickingSourceLocationScan({
          scan,
          locations: locs,
          expectedCode,
        });
        if (locRes.kind === "accept") {
          playScanBeep();
          appendScanToHistory(scan, {
            kind: "location",
            locationLabel: locRes.location_code,
          });
          explicitSourceSelectionRef.current = locRes.location_id;
          setActiveLocationId(locRes.location_id);
          setLocationScanSatisfied(true);
          setLocationHint(null);
          showScannerToast(`Lokalizacja ${locRes.location_code}`);
          if (requiresBasketPut) {
            void acceptSourceLocation(locRes.location_id, "accept");
          } else if (needsLocationScan) {
            openQtyStep(locRes.location_id);
          }
          return SCAN_CONSUMED;
        }
        if (locRes.kind === "reject_wrong") {
          const msg = formatWrongLocationMessage(locRes.expected, locRes.scanned);
          showScanFeedbackFromCode("WRONG_LOCATION_SCAN", { backendMessage: msg });
          setPickMsg(msg);
          setProcessAlert(msg);
          // Demote Helper "Ostatnia lokalizacja" — scan was handled as reject, not accept.
          appendScanToHistory(scan, { kind: "other" });
          return SCAN_CONSUMED;
        }
        if (needsLocationScan && (activeLocationId == null || !locationScanSatisfied)) {
          if (looksLikeProductBarcode(scan)) {
            const code = productMatchesScan(scan)
              ? "PICK_LOCATION_REQUIRED"
              : "WRONG_PRODUCT_SCAN";
            if (code === "PICK_LOCATION_REQUIRED") {
              setProductScanSatisfied(true);
              setScannerInputPlaceholder("Zeskanuj lokalizację");
            }
            showScanFeedbackFromCode(code);
            setPickMsg(mapWmsScanErrorCode(code).message);
            appendScanToHistory(scan);
            return SCAN_CONSUMED;
          }
        }
      }

      const multiDecision = resolveMultiPickingDetailScan(scan, {
        requiresBasketPut,
        hasPending: Boolean(effectivePending),
        hasActiveSeries:
          Boolean(detail?.basket_put_active_series?.basket_label) &&
          !effectivePending &&
          !Boolean(detail?.requires_basket_put_confirm),
        productEan: detail?.ean ?? detail?.sku ?? detail?.barcode ?? null,
        productRemaining: remaining,
        pendingEligibleLabels: pendingLabels,
        quantityMode: Boolean(detail?.requires_basket_put_confirm ?? requiresBasketPut),
        hasSourceLocation: !(needsLocationScan && !locationScanSatisfied),
        // Basket may be offered when UI has a location; confirmBasketScan awaits server accept/re-accept.
      });

      // Seed-only while detail GET in flight: STATE B (await basket).
      const decision =
        !detail && effectivePending
          ? resolveMultiPickingDetailScan(scan, {
              requiresBasketPut: true,
              hasPending: true,
              hasActiveSeries: false,
              productEan: null,
              pendingEligibleLabels: pendingLabels,
            })
          : multiDecision;

      multiScanTrace("DETAIL_SCAN", {
        raw_code: scan,
        classified_as: decision.kind,
        reason: "reason" in decision ? decision.reason : null,
        code: decision.kind === "reject" ? decision.code : null,
        pending: Boolean(effectivePending),
        series: Boolean(detail?.basket_put_active_series?.basket_label),
        product_id: productId,
      });

      if (decision.kind === "reject") {
        const hint =
          decision.code === "EXPECTED_BASKET_SCAN" || decision.code === "PENDING_PUT_EXISTS"
            ? pendingLabels
              ? `Oczekiwane koszyki: ${pendingLabels}`
              : null
            : null;
        showScanFeedbackFromCode(decision.code, { contextHint: hint });
        setPickMsg(mapWmsScanErrorCode(decision.code, { contextHint: hint }).message);
        appendScanToHistory(scan);
        return SCAN_CONSUMED;
      }
      if (decision.kind === "confirm_basket") {
        if (scanGateRef.current || pickBusy) return SCAN_CONSUMED;
        scanGateRef.current = true;
        void confirmBasketScan(raw, false, decision.reason);
        return SCAN_CONSUMED;
      }
      if (decision.kind === "product_ean_pick") {
        if (!detail) return SCAN_CONSUMED;
        setProductScanSatisfied(true);
        // Canonical active location only — never invent locations[0] after a prior scan.
        const loc = selectedLocation;
        if (!pickQueueDone && loc) {
          if (needsLocationScan && !locationScanSatisfied) {
            showScanFeedbackFromCode("PICK_LOCATION_REQUIRED");
            setPickMsg(mapWmsScanErrorCode("PICK_LOCATION_REQUIRED").message);
            setScannerInputPlaceholder("Zeskanuj lokalizację");
            appendScanToHistory(scan);
            playScanBeep();
            return SCAN_CONSUMED;
          }
          if (scanGateRef.current || pickBusy) return SCAN_CONSUMED;
          multiScanTrace("PRODUCT_SCAN_REQUEST_START", {
            product_id: productId,
            location_id: loc.location_id,
            via: "detail",
            pending_before: Boolean(effectivePending),
          });
          // Detail is mandatory — validated product scan opens qty, never auto-confirm.
          if (requiresBasketPut) {
            if (scanGateRef.current || pickBusy) return SCAN_CONSUMED;
            scanGateRef.current = true;
            void confirm_pick(1, loc.location_id);
          } else {
            playScanBeep();
            appendScanToHistory(scan);
            openQtyStep(loc.location_id);
          }
        } else if (!loc) {
          showScanFeedbackFromCode("PICK_LOCATION_REQUIRED");
          setPickMsg(mapWmsScanErrorCode("PICK_LOCATION_REQUIRED").message);
          setScannerInputPlaceholder("Zeskanuj lokalizację");
          appendScanToHistory(scan);
        }
        return SCAN_CONSUMED;
      }

      if (!detail) return SCAN_CONSUMED;

      // Non-MULTI fallthrough only (requiresBasketPut=false → fallthrough).
      const shelfLabel = (detail.consolidation_shelf_label ?? "").trim();
      if (detail.consolidation_active && shelfLabel && scan.toUpperCase() === normalizeScanEan(shelfLabel).toUpperCase()) {
        const oid = detail.active_fifo_order_id ?? detail.orders?.[0]?.order_id;
        if (oid != null && oid > 0) {
          try {
            const rows = await getConsolidationRackBundleView(oid, shelfLabel);
            setConsolidationRackRows(rows);
            playScanBeep();
            appendScanToHistory(scan);
            showScannerToast(shelfLabel);
          } catch {
            showScannerToast("Nie udało się wczytać widoku RK.");
          }
        }
        return SCAN_CONSUMED;
      }

      if (pickingSession.cartId != null && pickingSession.cartId > 0) {
        try {
          const locId = selectedLocation?.location_id ?? null;
          if (locId != null) {
            const bundle = await tryPickingBundleScan({
              tenantId: pickingTenantId,
              barcode: scan,
              cartId: pickingSession.cartId,
              sourceStatusId: pickingSession.orderUiStatusId,
              orderType,
              locationId: locId,
            });
            if (bundle.handled) {
              playScanBeep();
              appendScanToHistory(scan);
              if (bundle.scan) setBundlePickScan(bundle.scan);
              if (bundle.toast) showScannerToast(bundle.toast);
              if (bundle.refresh) await load();
              return SCAN_CONSUMED;
            }
          }
        } catch {
          /* product scan fallback */
        }
      }

      if (productMatchesScan(scan) && !pickQueueDone && selectedLocation) {
        setProductScanSatisfied(true);
        if (needsLocationScan && !locationScanSatisfied) {
          showScanFeedbackFromCode("PICK_LOCATION_REQUIRED");
          setPickMsg(mapWmsScanErrorCode("PICK_LOCATION_REQUIRED").message);
          setScannerInputPlaceholder("Zeskanuj lokalizację");
          appendScanToHistory(scan);
          playScanBeep();
          return SCAN_CONSUMED;
        }
        if (requiresBasketPut) {
          void confirm_pick(1, selectedLocation.location_id);
        } else {
          playScanBeep();
          appendScanToHistory(scan);
          openQtyStep(selectedLocation.location_id);
        }
        return SCAN_CONSUMED;
      }
      if (looksLikeProductBarcode(scan) && !productMatchesScan(scan)) {
        showScanFeedbackFromCode("WRONG_PRODUCT_SCAN");
        setPickMsg(mapWmsScanErrorCode("WRONG_PRODUCT_SCAN").message);
        appendScanToHistory(scan);
        return SCAN_CONSUMED;
      }
      return SCAN_CONSUMED;
    };
    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [detail, pickingSession, activeLocationId, registerScanHandler, appendScanToHistory, pickQueueDone, selectedLocation, pickingTenantId, orderType, showScannerToast, showScanFeedbackFromCode, load, productId, remaining, pickBusy, effectivePending, pendingSeed, enteredViaListProductScan, acceptSourceLocation, needsLocationScan, productScanRequired, openQtyStep, locationScanSatisfied, productMatchesScan, expectedLocationBadge]);

  const goBackToList = useCallback(
    (refreshList = false) => {
      if (!pickingSession) return;
      // Zachowaj cartId ze snapshotu — bez tego lista może wrócić na skan wózka / order-type.
      const sessionForList = {
        ...pickingSession,
        cartId:
          pickingSession.cartId != null && pickingSession.cartId > 0
            ? pickingSession.cartId
            : pickingCartSnapshot?.cartId != null && pickingCartSnapshot.cartId > 0
              ? pickingCartSnapshot.cartId
              : pickingSession.cartId,
        cartCode:
          (pickingSession.cartCode || pickingCartSnapshot?.cartCode || "").trim() ||
          pickingSession.cartCode,
        cartName:
          (pickingSession.cartName || pickingCartSnapshot?.cartName || "").trim() ||
          pickingSession.cartName,
      };
      const state: WmsPickingProductsNavState = refreshList
        ? { pickingSession: sessionForList, pickingListRefreshAt: Date.now() }
        : { pickingSession: sessionForList };
      const rid = sessionForList.recoveryOrderId;
      if (rid != null && rid > 0) {
        navigate(WMS_ROUTES.pickingRecovery(rid), { state });
        return;
      }
      navigate(WMS_ROUTES.pickingProducts, { state });
    },
    [navigate, pickingSession, pickingCartSnapshot],
  );

  async function confirmRemainingAndReturn() {
    if (!pickingSession || warehouseId == null || !detail) return;
    if (pickBusy) return;
    if (pickQueueDone || remaining <= 1e-9) {
      goBackToList(true);
      return;
    }
    if (isShortageResolved) {
      goBackToList(true);
      return;
    }
    if (productBlockedWithoutCode) {
      showScanFeedbackFromCode("PRODUCT_WITHOUT_SCAN_CODE_BLOCKED");
      setPickMsg(mapWmsScanErrorCode("PRODUCT_WITHOUT_SCAN_CODE_BLOCKED").message);
      return;
    }
    if (productScanRequired) {
      showScanFeedbackFromCode("PRODUCT_SCAN_REQUIRED");
      setPickMsg(mapWmsScanErrorCode("PRODUCT_SCAN_REQUIRED").message);
      setScannerInputPlaceholder("Zeskanuj produkt");
      return;
    }
    if (locationScanRequired) {
      showScanFeedbackFromCode("PICK_LOCATION_REQUIRED");
      setPickMsg(mapWmsScanErrorCode("PICK_LOCATION_REQUIRED").message);
      setScannerInputPlaceholder("Zeskanuj lokalizację");
      return;
    }
    const cartId = pickingSession.cartId;
    const pickingSessionId = pickingSession.pickingSessionId;
    const cartless = isCartlessPickingSession(pickingSession);
    if (!cartless && (cartId == null || !Number.isFinite(cartId) || cartId < 1)) {
      setPickMsg("Brak aktywnego wózka (cart_id).");
      return;
    }
    if (cartless && (pickingSessionId == null || pickingSessionId < 1)) {
      setPickMsg("Brak aktywnej sesji zbierania.");
      return;
    }
    setPickBusy(true);
    setPickMsg(null);
    try {
      const result = await postWmsPickingConfirmRemaining(
        pickingTenantId,
        warehouseId,
        pickingSession.orderUiStatusId,
        orderType,
        {
          product_id: productId,
          ...(cartless ? { picking_session_id: pickingSessionId! } : { cart_id: cartId! }),
          ...(recoveryOrderId != null && recoveryOrderId > 0
            ? { recovery_order_id: recoveryOrderId }
            : {}),
          product_scan_confirmed:
            productScanSatisfied ||
            !validationGates.needsProductScan ||
            validationGates.allowManualProductConfirm,
          location_scan_confirmed: locationScanSatisfied || !needsLocationScan,
        },
      );
      playScanBeep();
      const putQty = Number(result.quantity_put ?? 0);
      setPickMsg(result.message ?? (putQty > 0 ? `Zatwierdzono ${putQty} szt.` : null));
      goBackToList(true);
    } catch (e: unknown) {
      const extracted = extractWmsScanErrorDetail(e);
      if (extracted.code) {
        showScanFeedbackFromCode(extracted.code, {
          backendMessage: extracted.message,
          backendTitle: extracted.title,
          contextHint: extracted.eligibleLabels,
        });
        setPickMsg(
          mapWmsScanErrorCode(extracted.code, {
            backendMessage: extracted.message,
            backendTitle: extracted.title,
          }).message,
        );
      } else {
        let msg = "Zatwierdzenie nie powiodło się.";
        if (axios.isAxiosError(e)) {
          const data = e.response?.data;
          const d = data as { detail?: unknown; error?: string } | undefined;
          if (d?.detail != null) {
            msg = formatFastApiErrorDetail({ detail: d.detail });
          } else if (d?.error) msg = String(d.error);
        } else if (e instanceof Error && e.message) {
          msg = e.message;
        }
        showScanFeedbackFromCode("UNKNOWN_SCAN_CODE", { backendMessage: msg });
        setPickMsg(msg);
      }
    } finally {
      setPickBusy(false);
      scanGateRef.current = false;
    }
  }

  async function confirm_pick(qty: number, locationId: number) {
    if (!pickingSession || warehouseId == null || !detail || qty <= 0 || remaining <= 0) {
      scanGateRef.current = false;
      return;
    }
    if (pickBusy) {
      scanGateRef.current = false;
      return;
    }
    if (productBlockedWithoutCode) {
      scanGateRef.current = false;
      showScanFeedbackFromCode("PRODUCT_WITHOUT_SCAN_CODE_BLOCKED");
      setPickMsg(mapWmsScanErrorCode("PRODUCT_WITHOUT_SCAN_CODE_BLOCKED").message);
      return;
    }
    if (productScanRequired) {
      scanGateRef.current = false;
      showScanFeedbackFromCode("PRODUCT_SCAN_REQUIRED");
      setPickMsg(mapWmsScanErrorCode("PRODUCT_SCAN_REQUIRED").message);
      setScannerInputPlaceholder("Zeskanuj produkt");
      return;
    }
    if (locationScanRequired || locationId == null || locationId <= 0) {
      scanGateRef.current = false;
      showScanFeedbackFromCode("PICK_LOCATION_REQUIRED");
      setPickMsg(mapWmsScanErrorCode("PICK_LOCATION_REQUIRED").message);
      setScannerInputPlaceholder("Zeskanuj lokalizację");
      return;
    }
    const cartId = pickingSession.cartId;
    const pickingSessionId = pickingSession.pickingSessionId;
    const cartless = isCartlessPickingSession(pickingSession);
    if (!cartless && (cartId == null || !Number.isFinite(cartId) || cartId < 1)) {
      setPickMsg("Brak aktywnego wózka (cart_id).");
      scanGateRef.current = false;
      return;
    }
    if (cartless && (pickingSessionId == null || pickingSessionId < 1)) {
      setPickMsg("Brak aktywnej sesji zbierania.");
      scanGateRef.current = false;
      return;
    }
    scanGateRef.current = true;
    setPickBusy(true);
    setPickMsg(null);
    try {
      const result = await postWmsPickingQuickPick(pickingTenantId, warehouseId, pickingSession.orderUiStatusId, orderType, {
        product_id: productId,
        location_id: locationId,
        quantity: Math.min(qty, remaining),
        ...(cartless ? { picking_session_id: pickingSessionId! } : { cart_id: cartId! }),
        ...(recoveryOrderId != null && recoveryOrderId > 0 ? { recovery_order_id: recoveryOrderId } : {}),
        product_scan_confirmed:
          productScanSatisfied ||
          !validationGates.needsProductScan ||
          validationGates.allowManualProductConfirm,
        location_scan_confirmed: locationScanSatisfied || !needsLocationScan,
      });
      playScanBeep();
      if (result.phase === "AWAITING_BASKET_CONFIRMATION" || result.picked === false) {
        multiScanTrace("PRODUCT_SCAN_PENDING", {
          product_id: productId,
          pending_created: Boolean(result.pending),
          phase: result.phase ?? "AWAITING_BASKET_CONFIRMATION",
          pick_delta: 0,
        });
        setPickMsg(result.message ?? "Zeskanuj koszyk, aby potwierdzić odłożenie.");
        setScannerInputPlaceholder("Zeskanuj koszyk");
        await load();
        setManualOpen(false);
        return;
      }
      const putQty = result.quantity_put ?? Math.min(qty, remaining);
      const nextRem = remaining - putQty;
      setQtyStepOpen(false);
      setManualOpen(false);
      showScannerToast("Produkt zebrany");
      if (nextRem <= 1e-9) {
        if (detail?.consolidation_active) {
          await load();
        } else {
          goBackToList(true);
        }
      } else {
        await load();
        setManualLocId(null);
        if (result.active_series?.basket_label) {
          const seriesRem = result.active_series.line_remaining;
          const remTxt =
            typeof seriesRem === "number" && Number.isFinite(seriesRem)
              ? fmtQty(Math.max(0, seriesRem))
              : null;
          setPickMsg(
            remTxt != null
              ? `Koszyk ${result.active_series.basket_label} — skanuj kolejne sztuki. Pozostało: ${remTxt} szt.`
              : `Koszyk ${result.active_series.basket_label} — skanuj kolejne sztuki.`,
          );
          setScannerInputPlaceholder("Skanuj EAN produktu");
        }
      }
    } catch (e: unknown) {
      const extracted = extractWmsScanErrorDetail(e);
      if (extracted.code) {
        showScanFeedbackFromCode(extracted.code, {
          backendMessage: extracted.message,
          contextHint: extracted.eligibleLabels,
        });
        setPickMsg(mapWmsScanErrorCode(extracted.code, { backendMessage: extracted.message }).message);
        await load();
      } else {
        let msg = "Zapis nie powiódł się.";
        if (axios.isAxiosError(e)) {
          const data = e.response?.data;
          const d = data as { detail?: unknown; error?: string } | undefined;
          if (d?.detail != null) {
            msg = formatFastApiErrorDetail({ detail: d.detail });
          } else if (d?.error) msg = String(d.error);
        } else if (e instanceof Error && e.message) {
          msg = e.message;
        }
        const lower = msg.toLowerCase();
        let code = "UNKNOWN_SCAN_CODE";
        if (/brak otwartej ilości/i.test(msg)) code = "NO_OPEN_QUANTITY";
        else if (/nie należy do tej sesji|nie jest wymagany|product_not_in_session/i.test(msg))
          code = "PRODUCT_NOT_IN_SESSION";
        else if (/wystarczającego stanu|insufficient|quantity_exceeds_location/i.test(lower))
          code = "INSUFFICIENT_STOCK";
        else if (/nieprawidłową lokalizację|wrong_location|oczekiwana:/i.test(lower))
          code = "WRONG_LOCATION_SCAN";
        showScanFeedbackFromCode(code, { backendMessage: msg });
        setPickMsg(msg);
      }
    } finally {
      scanGateRef.current = false;
      setPickBusy(false);
    }
  }

  async function confirmBasketScan(
    rawScan: string,
    manual = false,
    routeReason: "pending_confirm" | "series_switch" | "select_destination" = "pending_confirm",
    quantity?: number,
  ) {
    if (!pickingSession || warehouseId == null || !pickingSession.cartId) {
      scanGateRef.current = false;
      return;
    }
    if (pickBusy) {
      scanGateRef.current = false;
      return;
    }
  // SOURCE location: needsLocationScan requires explicit activeLocationId (settings + multi-loc policy).
    // Never invent locations[0] for MULTI Pick provenance when scan is required.
    const multiNeedsLoc =
      Boolean(detail?.requires_basket_put_confirm) && needsLocationScan;
    const locId = multiNeedsLoc
      ? activeLocationId
      : (activeLocationId ??
        selectedLocation?.location_id ??
        (detail?.locations.length === 1 ? detail.locations[0].location_id : null) ??
        null);
    if (detail?.requires_basket_put_confirm && (locId == null || locId <= 0)) {
      scanGateRef.current = false;
      setPickBusy(false);
      showScanFeedbackFromCode("PICK_LOCATION_REQUIRED");
      setPickMsg(mapWmsScanErrorCode("PICK_LOCATION_REQUIRED").message);
      return;
    }
    scanGateRef.current = true;
    setPickBusy(true);
    setPickMsg(null);

    // Gate: server source_lock must exist before quantity=null basket call.
    if (detail?.requires_basket_put_confirm && locId != null) {
      const ensured = await ensureServerSourceForBasket(locId);
      if (!ensured) {
        scanGateRef.current = false;
        setPickBusy(false);
        showScanFeedbackFromCode("PICK_LOCATION_REQUIRED");
        setPickMsg(
          mapWmsScanErrorCode("PICK_LOCATION_REQUIRED", {
            backendMessage: "Zatwierdź lokalizację źródłową przed skanem koszyka.",
          }).message,
        );
        return;
      }
    }

    multiScanTrace("BASKET_SCAN", {
      raw_code: normalizeScanEan(rawScan),
      classified_as: routeReason,
      pending_before_confirm: Boolean(detail?.basket_put_pending || pendingSeed),
      product_id: productId,
      location_id: locId,
      quantity: quantity ?? null,
      server_source_accepted: isServerSourceAccepted(detail?.source_lock, productId, locId),
    });
    try {
      const result = await postWmsPickingConfirmBasketPut(
        pickingTenantId,
        warehouseId,
        pickingSession.orderUiStatusId,
        orderType,
        {
          cart_id: pickingSession.cartId,
          basket_scan: rawScan,
          manual,
          recovery_order_id: recoveryOrderId,
          product_id: Number.isFinite(productId) && productId > 0 ? productId : null,
          location_id: locId,
          quantity: quantity != null && quantity > 0 ? quantity : null,
        },
      );
      multiScanTrace("BASKET_CONFIRM_OK", {
        phase: result.phase ?? null,
        pick_delta: result.quantity_put ?? 0,
        order_id: result.order_id ?? null,
        order_item_id: result.order_item_id ?? null,
        basket_label: result.active_series?.basket_label ?? result.expected_basket_label ?? null,
      });

      if (result.phase === "QUANTITY_REQUIRED") {
        const row = result.eligible_baskets?.[0] as
          | {
              line_remaining?: number;
              order_id?: number;
              order_item_id?: number;
              basket_label?: string;
              location_available?: number;
              quantity_max?: number;
              location_id?: number;
            }
          | undefined;
        const rem = Number(row?.line_remaining ?? 0);
        const locAvailApi = Number(row?.location_available);
        const locAvail =
          Number.isFinite(locAvailApi) && locAvailApi >= 0
            ? locAvailApi
            : locStock(selectedLocation ?? detail?.locations.find((l) => l.location_id === locId) ?? { stock_quantity: 0 });
        const orderMeta =
          detail?.orders?.find((o) => Number(o.order_item_id) === Number(result.order_item_id)) ??
          detail?.orders?.find((o) => o.order_id === result.order_id);
        const locMeta =
          selectedLocation ??
          detail?.locations.find((l) => l.location_id === (row?.location_id ?? locId));
        setPendingSeed(null);
        setQuantityDraft({
          basketScan: rawScan,
          basketLabel: String(result.expected_basket_label || row?.basket_label || rawScan),
          orderId: Number(result.order_id || row?.order_id || 0),
          orderItemId: Number(result.order_item_id || row?.order_item_id || 0),
          orderNumber: orderMeta?.order_number ?? null,
          lineRemaining: rem > 0 ? rem : 1,
          locationAvailable: locAvail,
          locationCode: locMeta?.location_code ?? null,
          locationId: locId,
          requiredQty: Number(orderMeta?.quantity ?? rem),
          pickedQty: Number(orderMeta?.picked_quantity ?? 0),
          shortageQty: Number(orderMeta?.missing_quantity ?? 0),
          productName: detail?.name ?? `Produkt #${productId}`,
          productEan: detail?.ean ?? null,
          productImageUrl: detail?.image_url ?? null,
        });
        playScanBeep();
        setPickMsg(result.message ?? "Podaj ilość do odłożenia");
        return;
      }

      setQuantityDraft(null);
      setPendingSeed(null);
      setPickMsg(result.message ?? `Koszyk potwierdzony`);
      const putQty = Number(result.quantity_put ?? 0);
      const oiid = Number(result.order_item_id || 0);
      const basketLabel = String(result.active_series?.basket_label || result.expected_basket_label || "");
      const refreshed = await fetchProductDetail({ force: true });
      if (refreshed) applyDetailToState(refreshed);
      if (refreshed?.requires_basket_put_confirm && putQty > 1e-9 && oiid > 0) {
        const dest = (refreshed.eligible_basket_destinations ?? []).find(
          (b) => Number(b.order_item_id) === oiid && Number(b.line_remaining) > 1e-9,
        );
        if (dest) {
          setPostPutFollowUp({
            orderItemId: oiid,
            basketLabel: String(dest.basket_label || basketLabel || "koszyk"),
            remaining: Number(dest.line_remaining),
          });
        } else {
          setPostPutFollowUp(null);
        }
      } else {
        setPostPutFollowUp(null);
      }
      if (
        result.phase === "SERIES_DESTINATION_SWITCHED" ||
        result.phase === "SERIES_ACTIVATED" ||
        result.picked === false
      ) {
        if (result.phase === "SERIES_DESTINATION_SWITCHED" || result.phase === "SERIES_ACTIVATED") {
          showScanFeedback(
            mapWmsScanErrorCode("SERIES_DESTINATION_SWITCHED", {
              backendMessage: result.message,
              contextHint: result.active_series?.basket_label
                ? `Koszyk: ${result.active_series.basket_label}`
                : null,
            }),
          );
        } else {
          playScanBeep();
        }
        setScannerInputPlaceholder("Zeskanuj koszyk lub EAN");
        return;
      }
      playScanBeep();
      const after = await getWmsPickingProductDetail(
        pickingTenantId,
        warehouseId,
        pickingSession.orderUiStatusId,
        orderType,
        productId,
        pickingSession.cartId,
        recoveryOrderId,
        null,
        { force: true },
      );
      if (wmsPickingRemainingQty(after) <= 1e-9 && !after.consolidation_active) {
        goBackToList(true);
      } else {
        setScannerInputPlaceholder("Zeskanuj koszyk lub EAN");
      }
    } catch (e: unknown) {
      const extracted = extractWmsScanErrorDetail(e);
      const code = extracted.code || "UNKNOWN_SCAN_CODE";
      const feedback = mapWmsScanErrorCode(code, {
        backendMessage: extracted.message,
        contextHint: extracted.eligibleLabels,
      });
      multiScanTrace("BASKET_CONFIRM_FAIL", {
        raw_code: normalizeScanEan(rawScan),
        code,
        classified_as: routeReason,
      });
      showScanFeedback(feedback);
      setPickMsg(feedback.message);
      if (
        code === "QUANTITY_EXCEEDS_REMAINING" ||
        code === "QUANTITY_STALE" ||
        code === "QUANTITY_EXCEEDS_LOCATION_STOCK"
      ) {
        // Keep / refresh modal with live remaining if provided
        const remMatch = extracted.message?.match(/(\d+(?:[.,]\d+)?)\s*szt/i);
        if (quantityDraft && remMatch) {
          const rem = Number(String(remMatch[1]).replace(",", "."));
          if (Number.isFinite(rem) && rem > 0) {
            setQuantityDraft({ ...quantityDraft, lineRemaining: rem });
          }
        }
      } else {
        setQuantityDraft(null);
      }
      await load();
    } finally {
      scanGateRef.current = false;
      setPickBusy(false);
      refocusScannerInput();
    }
  }

  async function confirmShelfDeposit() {
    if (
      !detail?.consolidation_plan_id ||
      !detail.consolidation_plan_item_id ||
      !detail.pending_shelf_deposit
    ) {
      return;
    }
    setDepositBusy(true);
    setPickMsg(null);
    try {
      await postStageConsolidationItem(
        detail.consolidation_plan_id,
        detail.consolidation_plan_item_id,
        pickingTenantId ?? DAMAGE_TENANT_ID,
      );
      playScanBeep();
      goBackToList(true);
    } catch (e: unknown) {
      let msg = "Potwierdzenie odłożenia nie powiodło się.";
      if (axios.isAxiosError(e)) {
        const data = e.response?.data;
        const d = data as { detail?: unknown; error?: string } | undefined;
        if (d?.detail != null) msg = formatFastApiErrorDetail({ detail: d.detail });
        else if (d?.error) msg = String(d.error);
      }
      setPickMsg(msg);
    } finally {
      setDepositBusy(false);
    }
  }

  const pickBlockedByLocation = locationScanRequired;
  const pickBlockedByProductScan = productScanRequired || productBlockedWithoutCode;
  const openPreview = () => {
    if (!pickingSession) return;
    navigate(WMS_ROUTES.productPreview(productId), {
      state: { pickingSession, orderType, returnPath: routerLocation.pathname, returnState: { pickingSession } satisfies WmsPickingProductsNavState },
    });
  };

  const openManual = () => {
    if (!detail || detail.locations.length === 0) return;
    if (productBlockedWithoutCode) {
      showScanFeedbackFromCode("PRODUCT_WITHOUT_SCAN_CODE_BLOCKED");
      setProcessAlert(mapWmsScanErrorCode("PRODUCT_WITHOUT_SCAN_CODE_BLOCKED").message);
      return;
    }
    if (detail.requires_basket_put_confirm) {
      showScannerToast("Zeskanuj koszyk i podaj ilość — ręczny wpis nie tworzy Pick na MULTI.");
      return;
    }
    if (productScanRequired) {
      showScanFeedbackFromCode("PRODUCT_SCAN_REQUIRED");
      setProcessAlert("Zeskanuj produkt, aby kontynuować zbieranie.");
      return;
    }
    if (locationScanRequired) {
      showScanFeedbackFromCode("PICK_LOCATION_REQUIRED");
      setProcessAlert("Zeskanuj lokalizację, aby kontynuować zbieranie.");
      return;
    }
    const locId =
      activeLocationId ??
      (detail.locations.length === 1 ? detail.locations[0].location_id : null);
    if (locId == null) {
      showScanFeedbackFromCode("PICK_LOCATION_REQUIRED");
      return;
    }
    if (validationGates.allowManualProductConfirm) {
      setProductScanSatisfied(true);
    }
    setManualLocId(locId);
    const rem = wmsPickingRemainingQty(detail);
    setQtyStepValue(rem > 0 ? Math.min(1, rem) : 0);
    setQtyStepOpen(true);
  };

  const openShortageModal = useCallback(() => {
    if (!detail || reportShortageBlocked) return;
    setShortageErr(null);
    if (detail.requires_basket_put_confirm) {
      setBulkShortageOpen(true);
      return;
    }
    const rem = wmsPickingRemainingQty(detail);
    const picked = wmsPickingEffectivePickedQuantity(detail);
    setShortageQtyInput(rem > 1e-9 ? wmsPickingShortageDefaultQty(detail) : Math.max(picked, 1));
    setShortageProblemKind(picked > 1e-9 && rem <= 1e-9 ? "empty_location" : "product_shortage");
    window.requestAnimationFrame(() => setShortageConfirmOpen(true));
  }, [detail, reportShortageBlocked]);

  const openBulkShortage = useCallback(() => {
    if (!detail || reportShortageBlocked) return;
    setShortageErr(null);
    setPostPutFollowUp(null);
    window.requestAnimationFrame(() => setBulkShortageOpen(true));
  }, [detail, reportShortageBlocked]);

  const openLineShortage = useCallback(
    (orderItemId: number, maxQty: number) => {
      if (!detail || reportShortageBlocked) return;
      setShortageErr(null);
      setMultiShortageOrderItemId(orderItemId);
      setMultiShortageQty(maxQty);
      setPostPutFollowUp(null);
      window.requestAnimationFrame(() => setMultiShortageOpen(true));
    },
    [detail, reportShortageBlocked],
  );

  const submitBulkShortage = async (items: Array<{ order_item_id: number; missing_qty: number }>) => {
    if (shortageBusy || !pickingSession?.cartId || warehouseId == null || !detail) return;
    if (!items.length) return;
    const locId = selectedLocation?.location_id ?? activeLocationId ?? detail.locations[0]?.location_id ?? null;
    setShortageBusy(true);
    setShortageErr(null);
    try {
      const out = await postWmsPickingReportShortageBulk(
        pickingTenantId,
        warehouseId,
        pickingSession.orderUiStatusId,
        orderType,
        {
          product_id: productId,
          cart_id: pickingSession.cartId,
          items,
          location_id: locId,
          order_ids: detail.orders.map((o) => o.order_id),
          ...(recoveryOrderId != null && recoveryOrderId > 0 ? { recovery_order_id: recoveryOrderId } : {}),
        },
      );
      let optimistic = detail;
      for (const line of items) {
        optimistic = applyWmsPickingShortageToDetail(optimistic, line.missing_qty, line.order_item_id);
      }
      applyDetailToState(optimistic);
      dispatchWmsShortagesUpdated();
      playScanBeep();
      setBulkShortageOpen(false);
      setPostPutFollowUp(null);
      showScannerToast(
        `Zgłoszono brak ${fmtQty(out.total_shortage_qty ?? items.reduce((s, i) => s + i.missing_qty, 0))} szt. ` +
          `w ${items.length} koszykach`,
      );
      await load();
      refocusScannerInput();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: unknown } } };
      const detailRaw = ax.response?.data?.detail;
      let msg = formatFastApiErrorDetail(ax.response?.data) || "Nie udało się zgłosić braków zbiorczo.";
      if (detailRaw && typeof detailRaw === "object" && !Array.isArray(detailRaw)) {
        const d = detailRaw as { message?: string; code?: string; order_item_id?: number; live_unresolved?: number };
        if (d.message) msg = String(d.message);
        if (d.code === "SHORTAGE_STALE" || d.code === "SHORTAGE_EXCEEDS_UNRESOLVED" || d.error === "SHORTAGE_STALE") {
          showScanFeedbackFromCode("QUANTITY_STALE", { backendMessage: msg });
          await load();
        }
      }
      setShortageErr(msg);
    } finally {
      setShortageBusy(false);
    }
  };

  const submitMultiAllocationShortage = async (orderItemId: number, shortageQty: number) => {
    if (shortageBusy || !pickingSession || warehouseId == null || !detail) return;
    if (orderItemId <= 0 || shortageQty <= 0) return;
    const locId = selectedLocation?.location_id ?? activeLocationId ?? detail.locations[0]?.location_id ?? null;
    setShortageBusy(true);
    setShortageErr(null);
    try {
      await postWmsPickingReportShortage(pickingTenantId, warehouseId, pickingSession.orderUiStatusId, orderType, {
        product_id: productId,
        location_id: locId,
        missing_qty: shortageQty,
        ...(isCartlessPickingSession(pickingSession)
          ? { picking_session_id: pickingSession.pickingSessionId! }
          : { cart_id: pickingSession.cartId! }),
        order_ids: detail.orders.map((o) => o.order_id),
        problem_kind: "product_shortage",
        order_item_id: orderItemId,
        ...(recoveryOrderId != null && recoveryOrderId > 0 ? { recovery_order_id: recoveryOrderId } : {}),
      });
      const optimistic = applyWmsPickingShortageToDetail(detail, shortageQty, orderItemId);
      applyDetailToState(optimistic);
      dispatchWmsShortagesUpdated();
      playScanBeep();
      setMultiShortageOpen(false);
      setPostPutFollowUp(null);
      showScannerToast(`Zgłoszono brak ${fmtQty(shortageQty)} szt.`);
      await load();
      refocusScannerInput();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: unknown } };
      setShortageErr(formatFastApiErrorDetail(ax.response?.data) || "Nie udało się zgłosić braku.");
    } finally {
      setShortageBusy(false);
    }
  };

  const submitUndoPickById = async (pickId: number) => {
    const cartId = pickingSession?.cartId ?? null;
    const sessionId = pickingSession?.pickingSessionId ?? null;
    if (undoBusyPickId != null || warehouseId == null) return;
    if ((cartId == null || cartId < 1) && (sessionId == null || sessionId < 1)) return;
    setUndoBusyPickId(pickId);
    setPickMsg(null);
    try {
      await postWmsPickingUndoPickById(pickingTenantId, warehouseId, pickId, {
        cartId,
        pickingSessionId: sessionId,
      });
      playScanBeep();
      showScannerToast(`Cofnięto pobranie #${pickId}`);
      if (highlightPickId === pickId) setHighlightPickId(null);
      await load();
      await reloadDraftPicks();
      refocusScannerInput();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: unknown } };
      showScannerToast(formatFastApiErrorDetail(ax.response?.data) || "Cofnięcie pobrania nie powiodło się.");
    } finally {
      setUndoBusyPickId(null);
    }
  };

  const submitUndoPick = async () => {
    if (undoBusy || !pickingSession?.cartId || warehouseId == null || !detail || !canUndoPick) return;
    setUndoBusy(true);
    setPickMsg(null);
    try {
      await postWmsPickingUndoPick(pickingTenantId, warehouseId, pickingSession.orderUiStatusId, orderType, {
        product_id: productId,
        cart_id: pickingSession.cartId,
        quantity: 1,
        location_id: selectedLocation?.location_id ?? activeLocationId ?? null,
        order_ids: detail.orders.map((o) => o.order_id),
        ...(recoveryOrderId != null && recoveryOrderId > 0 ? { recovery_order_id: recoveryOrderId } : {}),
      });
      playScanBeep();
      showScannerToast("Cofnięto pobranie 1 szt.");
      await load();
      refocusScannerInput();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: unknown } };
      showScannerToast(formatFastApiErrorDetail(ax.response?.data) || "Cofnięcie nie powiodło się.");
    } finally {
      setUndoBusy(false);
    }
  };

  useEffect(() => {
    if (shortageConfirmOpen || multiShortageOpen || bulkShortageOpen || manualOpen || quantityDraft) return;
    refocusScannerInput();
  }, [shortageConfirmOpen, multiShortageOpen, bulkShortageOpen, manualOpen, quantityDraft, refocusScannerInput]);

  const submitShortage = async () => {
    if (shortageBusy) return;
    if (!pickingSession || warehouseId == null || !detail || reportShortageBlocked || shortageQtyInput <= 0) {
      return;
    }
    const fifoOrder =
      detail.orders.find((o) => o.order_id === detail.active_fifo_order_id) ?? detail.orders[0] ?? null;
    const lineId = fifoOrder?.order_item_id ?? null;
    const locId = selectedLocation?.location_id ?? activeLocationId ?? detail.locations[0]?.location_id ?? null;
    setShortageBusy(true);
    setShortageErr(null);
    try {
      if (shortageProblemKind === "empty_location") {
        if (locId == null) {
          setShortageErr("Wybierz lokalizację, aby potwierdzić pustkę.");
          return;
        }
        const observed = locStock(selectedLocation ?? detail.locations[0]);
        const emptyRes = await postWmsPickingConfirmEmptyLocation(
          pickingTenantId,
          warehouseId,
          pickingSession.orderUiStatusId,
          orderType,
          {
            product_id: productId,
            location_id: locId,
            cart_id: pickingSession.cartId!,
            observed_stock_qty: observed,
            order_ids: detail.orders.map((o) => o.order_id),
            ...(recoveryOrderId != null && recoveryOrderId > 0 ? { recovery_order_id: recoveryOrderId } : {}),
          },
        );
        playScanBeep();
        setShortageConfirmOpen(false);
        const alt = emptyRes.alternate_locations?.[0];
        if (emptyRes.stock_effect === "pending_document_correction") {
          showScannerToast(
            alt
              ? `Pusta lokalizacja zgłoszona (korekta dokumentowa). Alternatywa: ${alt.location_code}`
              : "Pusta lokalizacja zgłoszona — zablokowana do zbierania do korekty dokumentowej.",
          );
          if (alt) setActiveLocationId(alt.location_id);
        } else if (alt) {
          showScannerToast(`Lokalizacja wyzerowana. Alternatywa: ${alt.location_code}`);
          setActiveLocationId(alt.location_id);
        } else {
          showScannerToast(
            emptyRes.shortage_kind === "PRODUCT_SHORTAGE"
              ? "Brak stocku na innych lokalizacjach — zgłoszono brak produktu."
              : "Potwierdzono pustą lokalizację.",
          );
        }
        dispatchWmsShortagesUpdated();
        await load();
        refocusScannerInput();
        return;
      }

      await postWmsPickingReportShortage(pickingTenantId, warehouseId, pickingSession.orderUiStatusId, orderType, {
        product_id: productId,
        location_id: locId,
        missing_qty: shortageQtyInput,
        ...(isCartlessPickingSession(pickingSession)
          ? { picking_session_id: pickingSession.pickingSessionId! }
          : { cart_id: pickingSession.cartId! }),
        order_ids: detail.orders.map((o) => o.order_id),
        problem_kind: shortageProblemKind === "qty_mismatch" ? "qty_mismatch" : "product_shortage",
        ...(recoveryOrderId != null && recoveryOrderId > 0 ? { recovery_order_id: recoveryOrderId } : {}),
        // product-level remaining shortage: rozdzielaj FE_MISSING po liniach zamówień (budget).
        // order_item_id tylko przy dogrywce — inaczej max_declarable = 1 linia FIFO i multi-order FAIL.
        ...(recoveryOrderId != null && recoveryOrderId > 0 && lineId != null && lineId > 0
          ? { order_item_id: lineId }
          : {}),
      });
      const optimistic = applyWmsPickingShortageToDetail(detail, shortageQtyInput);
      applyDetailToState(optimistic);
      dispatchWmsShortagesUpdated();
      playScanBeep();
      setShortageConfirmOpen(false);
      showScannerToast(
        shortageProblemKind === "qty_mismatch"
          ? "Zgłoszono rozbieżność ilości — bez zerowania lokalizacji."
          : "Brak zapisany. Kontynuuj zbieranie.",
      );
      const nextRem = wmsPickingRemainingQty(optimistic);
      if (nextRem <= 1e-9) {
        goBackToList(true);
        return;
      }
      void refreshDetailSilently();
      refocusScannerInput();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: unknown } };
      setShortageErr(formatFastApiErrorDetail(ax.response?.data) || "Zgłoszenie braku nie powiodło się.");
    } finally {
      setShortageBusy(false);
    }
  };

  if (warehouseId == null || !pickingSession) return <div className="p-6 text-center text-sm font-medium text-slate-500">Przekierowanie…</div>;

  return (
    <WmsOperationalPageShell className="bg-white font-sans text-slate-900 select-none">
      <PickingSimpleHeader
        onBack={() => goBackToList(true)}
        backAriaLabel="Wróć do listy produktów"
      />

      <WmsOperationalPageBody wide className="flex flex-col gap-5 !py-4 pb-28 md:!py-5">
      {loading && !detail && <div className="py-24 text-center text-sm text-slate-500">Ładowanie produktu…</div>}
      {(err || terminalPolicyErr) && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {err || terminalPolicyErr}
        </div>
      )}

      {detail && (
        <div className="flex w-full flex-col gap-5">
          <div className={[PICKING_CARD_CLASS, "relative flex w-full flex-col gap-4 p-4 sm:p-5"].join(" ")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <PickingFieldLabel>Zebrane</PickingFieldLabel>
                <div className="mt-0.5">
                  <PickingQtyPair
                    picked={fmtQty(displayPickedDetail)}
                    total={fmtQty(detail.total_quantity)}
                  />
                </div>
              </div>
              {detail.locations[0] ? (
                <div className="flex w-fit max-w-[55%] shrink-0 flex-col items-end gap-0.5">
                  <PickingFieldLabel>Lokalizacja</PickingFieldLabel>
                  <PickingLocationBadge
                    variant="compact"
                    text={formatWmsPickingLocationPillLabel(
                      detail.locations[0].location_code,
                      locStock(detail.locations[0]) > 1e-9 ? locStock(detail.locations[0]) : undefined,
                    )}
                  />
                </div>
              ) : null}
            </div>

            <div className="flex w-full justify-center py-1">
              <div className="flex h-36 w-36 items-center justify-center bg-transparent sm:h-44 sm:w-44">
                {detail.image_url ? (
                  <img src={detail.image_url} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <div className="text-xs font-semibold text-slate-300">Brak zdjęcia</div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 text-center">
              {detail.consolidation_active ? (
                <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                  Konsolidacja
                </span>
              ) : null}
              <p
                className={[
                  "break-words font-bold uppercase leading-snug text-slate-900",
                  wmsTypoClass.base,
                ].join(" ")}
              >
                {detail.name}
              </p>
              <PickingEanBadge value={detail.ean} className="justify-center" />
              {!validationGates.hasScannableProductCode ? (
                <p className="text-center text-xs font-medium text-amber-800">
                  Produkt bez kodu EAN
                  {validationGates.allowManualProductConfirm
                    ? " — potwierdź ręcznie ilość."
                    : " — zbieranie zablokowane (włącz opcję w ustawieniach)."}
                </p>
              ) : null}
              {productBlockedWithoutCode ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm text-rose-900">
                  {mapWmsScanErrorCode("PRODUCT_WITHOUT_SCAN_CODE_BLOCKED").message}
                </p>
              ) : null}
              {isShortageResolved ? (
                <PickingShortageBadge
                  missing={fmtQty(missingTotal)}
                  total={fmtQty(detail.total_quantity)}
                />
              ) : null}
              {detail.consolidation_active && detail.consolidation_shelf_label ? (
                <div className="mt-1 w-fit rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-900">
                  Odłóż na: {detail.consolidation_shelf_label}
                </div>
              ) : null}
            </div>
          </div>

          {effectivePending ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Produkt zeskanowany</p>
              <p className="mt-1 text-sm font-semibold text-amber-950">
                {fmtQty(effectivePending.quantity ?? 1)} szt. — zeskanuj jeden z koszyków
              </p>
              {(effectivePending.eligible_baskets?.length ?? 0) > 0 ? (
                <ul className="mt-3 space-y-2">
                  {effectivePending.eligible_baskets!.map((b) => (
                    <li key={b.basket_id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2">
                      <span className="font-bold text-amber-950">{b.basket_label}</span>
                      <span className="text-sm font-semibold text-amber-800">pozostało {fmtQty(b.line_remaining)}</span>
                    </li>
                  ))}
                </ul>
              ) : (detail.eligible_basket_destinations?.length ?? 0) > 0 ? (
                <ul className="mt-3 space-y-2">
                  {detail.eligible_basket_destinations!.map((b) => (
                    <li key={`${b.basket_id}-${b.order_item_id}`} className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2">
                      <span className="font-bold text-amber-950">{b.basket_label}</span>
                      <span className="text-sm font-semibold text-amber-800">pozostało {fmtQty(b.line_remaining)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div>
            <PickingFieldLabel>Lokalizacje</PickingFieldLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.locations.map((loc) => {
                const stock = locStock(loc);
                const label = formatWmsPickingLocationPillLabel(
                  loc.location_code,
                  stock > 1e-9 ? stock : undefined,
                );
                const active = activeLocationId === loc.location_id;
                return (
                  <button
                    key={loc.location_id}
                    type="button"
                    onClick={() => {
                      if (stock <= 1e-9) {
                        setActiveLocationId(null);
                        explicitSourceSelectionRef.current = null;
                        setLocationHint("Brak dostępnego stanu w tej lokalizacji (już pobrane w tej kompletacji).");
                        return;
                      }
                      explicitSourceSelectionRef.current = loc.location_id;
                      setActiveLocationId(loc.location_id);
                      setLocationHint(null);
                      setMultiLocAlertOpen(false);
                      if (detail.requires_basket_put_confirm) {
                        void acceptSourceLocation(loc.location_id, "accept");
                      } else if (needsLocationScan) {
                        // Settings / multi-loc require a real location scan — tap only highlights.
                        setScannerInputPlaceholder("Zeskanuj lokalizację");
                        setPickMsg("Zeskanuj lokalizację, aby kontynuować zbieranie.");
                      } else if (!pickQueueDone && !isShortageResolved) {
                        openQtyStep(loc.location_id);
                      }
                    }}
                    className={active ? "rounded-full ring-2 ring-slate-400 ring-offset-1" : ""}
                    aria-pressed={active}
                  >
                    <PickingLocationBadge text={label} muted={stock <= 1e-9} variant="compact" />
                  </button>
                );
              })}
            </div>
            {locationHint ? <p className="mt-2 text-xs font-semibold text-amber-800">{locationHint}</p> : null}
          </div>

          {detail.orders.length > 0 ? (
            <div>
              <PickingFieldLabel>Zamówienia</PickingFieldLabel>
              <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
                {detail.orders.map((o) => {
                  const missLn = Number(o.missing_quantity ?? 0);
                  const pickedLn = Number(o.picked_quantity ?? 0);
                  const qtyLn = Number(o.quantity ?? 0);
                  return (
                    <li
                      key={o.order_item_id ?? o.order_id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-2 font-semibold text-slate-900">
                        <OrderPriorityFlameIcon priorityColor={o.priority_color} />
                        <span className="break-words">
                          #{o.order_number} ({fmtQty(pickedLn)}/{fmtQty(qtyLn)})
                        </span>
                        {missLn > 1e-9 ? (
                          <PickingShortageBadge missing={fmtQty(missLn)} total={fmtQty(qtyLn)} />
                        ) : null}
                      </span>
                      {o.line_value != null ? (
                        <span className="shrink-0 tabular-nums text-sm text-slate-600">
                          {fmtQty(Number(o.line_value))} PLN
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {detail.requires_basket_put_confirm ? (
            <div className="space-y-3">
              {postPutFollowUp ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-bold text-amber-950">
                    {postPutFollowUp.basketLabel}: pozostało {fmtQty(postPutFollowUp.remaining)} szt.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={shortageBusy}
                      onClick={() =>
                        openLineShortage(postPutFollowUp.orderItemId, postPutFollowUp.remaining)
                      }
                      className="rounded-lg border border-amber-400 bg-amber-600 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40"
                    >
                      Oznacz pozostałe jako brak
                    </button>
                  </div>
                </div>
              ) : null}
              <MultiBasketAllocationPanel
                orders={detail.orders}
                draftPicks={draftPicks}
                highlightPickId={highlightPickId}
                picksLoading={draftPicksLoading}
                undoBusyPickId={undoBusyPickId}
                onOpenBulkShortage={openBulkShortage}
                onReportLineShortage={openLineShortage}
                onUndoPick={(pickId) => {
                  void submitUndoPickById(pickId);
                }}
                shortageBusy={shortageBusy}
              />
            </div>
          ) : detail.order_bundle_trees && detail.order_bundle_trees.length > 0 ? (
            <BundlePickingOrderTree trees={detail.order_bundle_trees} />
          ) : null}

          {(() => {
            const bundleDisplay = bundlePickScan ? buildPickingBundleDisplay(bundlePickScan) : null;
            return bundleDisplay ? <BundlePickingScanCard display={bundleDisplay} /> : null;
          })()}
          {consolidationRackRows.length > 0 ? (
            <BundleConsolidationRackCard
              rows={consolidationRackRows}
              shelfLabel={detail.consolidation_shelf_label}
            />
          ) : null}

          {pickMsg ? <p className="text-sm font-semibold text-slate-700">{pickMsg}</p> : null}
        </div>
      )}
      </WmsOperationalPageBody>

      <PickingStickyFooter
        onOpenOptions={() => setOptionsOpen(true)}
        onZebrane={() => {
          if (pickQueueDone || isShortageResolved) {
            void confirmRemainingAndReturn();
            return;
          }
          openManual();
        }}
        zebraneDisabled={pickBusy || pickBlockedByProductScan || !detail}
        zebraneBusy={pickBusy}
        zebraneLabel={pickQueueDone || isShortageResolved ? "Zapisz" : "Zbierz"}
      />
      <PickingOptionsSheet
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        onProductPreview={openPreview}
        onMarkShortage={openShortageModal}
        onPick={openManual}
        notesDisabled
        replenishmentDisabled
        shortageDisabled={reportShortageBlocked || isShortageResolved}
        pickDisabled={pickQueueDone || isShortageResolved || Boolean(detail?.requires_basket_put_confirm)}
      />

      {detail && qtyStepOpen ? (
        <AppOverlayPortal open lockBodyScroll>
          <PickingQtyPanel
            productName={detail.name}
            ean={detail.ean}
            imageUrl={detail.image_url}
            locationLabel={qtySourceLocationLabel}
            remainingLabel={fmtQty(remaining)}
            qty={qtyStepValue}
            maxQty={remaining}
            busy={pickBusy}
            onChangeQty={setQtyStepValue}
            onBack={() => setQtyStepOpen(false)}
            onConfirm={() => {
              const locId = qtySourceLocationId;
              if (locId == null || locId <= 0) {
                showScanFeedbackFromCode("PICK_LOCATION_REQUIRED");
                setQtyStepOpen(false);
                return;
              }
              if (qtyStepValue <= 0 || qtyStepValue > remaining + 1e-9) return;
              void confirm_pick(qtyStepValue, locId);
            }}
          />
        </AppOverlayPortal>
      ) : null}

      <PickingProcessAlert
        open={multiLocAlertOpen}
        tone="error"
        message="Produkt znajduje się na więcej niż jednej półce. Zeskanuj półkę aby kontynuować zbieranie."
        onClose={() => setMultiLocAlertOpen(false)}
      />
      <PickingProcessAlert
        open={processAlert != null}
        message={processAlert}
        onClose={() => setProcessAlert(null)}
      />

      {/* MODAL WPISU RĘCZNEGO */}
      {manualOpen && detail && (
        <ModalShell title="Zbierz produkt" onClose={() => setManualOpen(false)}>
          <label className="block mb-4">
            <span className="text-xs font-semibold text-slate-600">Podaj zebraną ilość (szt.)</span>
            <input type="number" min={0} step={0.01} max={remaining} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-semibold outline-none" value={manualQty || ""} onChange={(e) => setManualQty(Number(e.target.value))} />
          </label>
          <button
            type="button"
            disabled={pickBusy || pickBlockedByProductScan || (needsLocationScan && manualLocId == null)}
            onClick={() => {
              if (pickBlockedByProductScan) {
                showScanFeedbackFromCode("PRODUCT_SCAN_REQUIRED");
                setPickMsg(mapWmsScanErrorCode("PRODUCT_SCAN_REQUIRED").message);
                return;
              }
              if (manualLocId != null) void confirm_pick(manualQty, manualLocId);
            }}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-40"
          >
            Potwierdź pobranie
          </button>
        </ModalShell>
      )}

      {/* MODAL POTWIERDZENIA BRAKU / ROZBIEŻNOŚCI */}
      {shortageConfirmOpen && detail && (
        <ModalShell
          title="Zgłoś problem / brak"
          onClose={() => {
            if (!shortageBusy) setShortageConfirmOpen(false);
          }}
          closeDisabled={shortageBusy}
        >
          <p className="text-sm text-slate-600 mb-3">
            Lokalizacja: <span className="font-mono font-bold text-slate-900">{shortageLocationLabel}</span>
          </p>
          <div className="space-y-2 mb-4">
            <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer ${shortageProblemKind === "empty_location" ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`}>
              <input
                type="radio"
                name="shortageKind"
                checked={shortageProblemKind === "empty_location"}
                onChange={() => setShortageProblemKind("empty_location")}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-bold text-slate-900">Lokalizacja jest pusta</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Potwierdzam, że na lokalizacji {shortageLocationLabel} nie ma tego produktu. Stan systemu zostanie wyzerowany.
                </span>
              </span>
            </label>
            <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer ${shortageProblemKind === "qty_mismatch" ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`}>
              <input
                type="radio"
                name="shortageKind"
                checked={shortageProblemKind === "qty_mismatch"}
                onChange={() => setShortageProblemKind("qty_mismatch")}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-bold text-slate-900">Nie znalazłem wymaganej ilości / stan niezgodny</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Zapisze brak w zbieraniu bez automatycznego zerowania całej lokalizacji.
                </span>
              </span>
            </label>
            <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer ${shortageProblemKind === "product_shortage" ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`}>
              <input
                type="radio"
                name="shortageKind"
                checked={shortageProblemKind === "product_shortage"}
                onChange={() => setShortageProblemKind("product_shortage")}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-bold text-slate-900">Brak produktu (bez korekty stocku lokalizacji)</span>
                <span className="block text-xs text-slate-500 mt-0.5">Klasyczne zgłoszenie braku na zamówieniu.</span>
              </span>
            </label>
          </div>
          {shortageProblemKind !== "empty_location" ? (
            <label className="block mb-4">
              <span className="text-xs font-semibold text-slate-600">Ilość braku (szt.)</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-semibold outline-none"
                value={shortageQtyInput || ""}
                onChange={(e) => setShortageQtyInput(Number(e.target.value))}
              />
            </label>
          ) : null}
          {shortageErr ? <p className="mb-3 text-sm font-semibold text-red-700">{shortageErr}</p> : null}
          <button
            type="button"
            disabled={shortageBusy || (shortageProblemKind !== "empty_location" && shortageQtyInput <= 0)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void submitShortage();
            }}
            className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-50"
          >
            {shortageBusy
              ? "Zapisywanie…"
              : shortageProblemKind === "empty_location"
                ? "Potwierdź pustą lokalizację"
                : "Zgłoś brak produktu"}
          </button>
        </ModalShell>
      )}

      {quantityDraft ? (
        <BasketPutQuantityModal
          draft={quantityDraft}
          busy={pickBusy}
          onCancel={() => {
            setQuantityDraft(null);
            refocusScannerInput();
          }}
          onConfirm={(qty) => {
            void confirmBasketScan(quantityDraft.basketScan, false, "select_destination", qty);
          }}
        />
      ) : null}

      {multiShortageOpen && detail ? (
        <MultiAllocationShortageModal
          orders={detail.orders}
          initialOrderItemId={multiShortageOrderItemId}
          initialQty={multiShortageQty}
          busy={shortageBusy}
          error={shortageErr}
          onClose={() => {
            if (!shortageBusy) setMultiShortageOpen(false);
          }}
          onConfirm={(orderItemId, shortageQty) => {
            void submitMultiAllocationShortage(orderItemId, shortageQty);
          }}
        />
      ) : null}

      {bulkShortageOpen && detail ? (
        <MultiBulkShortageModal
          orders={detail.orders}
          productName={detail.name}
          productEan={detail.ean}
          busy={shortageBusy}
          error={shortageErr}
          onClose={() => {
            if (!shortageBusy) setBulkShortageOpen(false);
          }}
          onConfirm={(items) => {
            void submitBulkShortage(items);
          }}
        />
      ) : null}
    </WmsOperationalPageShell>
  );
}