import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { extractApiErrorMessage } from "../../api/authApi";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { updateWarehousePriorityTask } from "../../api/warehouseOperationsApi";
import {
  getWmsPickingDefaultCart,
  getWmsPickingProductLines,
  getWmsPickingResolveCart,
  postWmsPickingCancelCartlessSession,
  postWmsPickingCancelSession,
  postWmsPickingFinalizeCart,
  postWmsPickingFinalizeCartless,
  postWmsPickingRecoveryFinalize,
  postWmsPickingQuickPick,
  postWmsPickingCancelPendingBasketPut,
  postWmsPickingConfirmBasketPut,
  postWmsPickingStartCartless,
  extractFinalizeFailingPick,
  type WmsBasketPutPendingListApi,
  type WmsPickingCohortMissingLineApi,
  type WmsPickingProductLineApi,
  type WmsPickingSessionStatsApi,
} from "../../api/wmsPickingProductsApi";
import { modeRequiresCartScan } from "./wmsPickingFlowResolve";
import type { PickingFlowMode } from "../../api/wmsPickingEntryApi";
import { useMergedPickingSession, useWmsPickingCart } from "../../context/WmsPickingCartContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { WmsOperationalPageBody, WmsOperationalPageShell } from "../../components/wms/execution/WmsOperationalPageShell";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { playScanBeep } from "../../utils/playScanBeep";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { panelSidebarSubCountBadgeStyle } from "../../utils/panelSidebarHierarchy";
import { formatOperationalDurationSince } from "../../utils/formatOperationalDuration";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { WmsPickingProductsNavState } from "./wmsPickingFlowTypes";
import { clearActivePriorityTask, loadActivePriorityTask, priorityTaskAppliesTo, priorityTaskOrderIds, type ActivePriorityTask } from "./activePriorityTask";
import { formatWmsPickingLocationPillLabel } from "./wmsPickingLocationPill";
import {
  pickingFinalizeHasShortageSignals,
  polishProductShortageModalSkuLine,
  sortWmsPickingProductLinesPickFlow,
  wmsPickingEffectivePickedQuantity,
  wmsPickingDisplayProgressParts,
  wmsPickingLineMissingQty,
  wmsPickingLineResolutionStatus,
  wmsPickingRemainingQty,
  wmsPickingProductLineComplete,
  wmsPickingRowScanEligible,
} from "./wmsPickingUiGates";
import { WmsPickingSessionTopBar } from "./WmsPickingSessionTopBar";
import { useWmsShortagesRefresh } from "../../hooks/useWmsShortagesRefresh";
import { WMS_ROUTES } from "./wmsRoutes";
import { dispatchWmsShortagesUpdated } from "../../utils/wmsRefresh";
import { Image as ImageIcon, MapPin, AlertTriangle, Check, Loader2 } from "lucide-react";
import type { BundleScanOut } from "../../api/bundlesLogisticsApi";
import { BundlePickingScanCard } from "../../components/wms/bundle/BundlePickingScanCard";
import { tryPickingBundleScan } from "../../services/bundleScannerIntegration";
import { buildPickingBundleDisplay } from "../../utils/bundleScanFlow";
import {
  multiScanTrace,
  resolveMultiPickingListScan,
} from "../../utils/multiPickingScanRoute";
import { extractWmsScanErrorDetail } from "../../wms/scanFeedback/wmsScanErrorCatalog";
import { SCAN_CONSUMED, SCAN_NOT_CONSUMED } from "../../utils/wmsScanDispatch";
import {
  preparePickingProductDetailNavigation,
  type PickingDetailNavSource,
} from "../../utils/pickingProductDetailNav";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

function productLineMatchesScan(row: WmsPickingProductLineApi, scan: string): boolean {
  const b = normalizeScanEan(scan).toUpperCase();
  if (!b) return false;
  const cands = [row.ean, String(row.product_id)]
    .filter(Boolean)
    .map((x) => normalizeScanEan(String(x)).toUpperCase())
    .filter((x) => x.length > 0);
  return cands.some((c) => c === b || b.endsWith(c) || c.endsWith(b));
}

function primaryStockDisplay(row: WmsPickingProductLineApi): number {
  const q = row.primary_location_stock;
  return typeof q === "number" && Number.isFinite(q) ? q : 0;
}

function rowScannerEligible(row: WmsPickingProductLineApi): boolean {
  return wmsPickingRowScanEligible(row);
}

function extraLocationsHint(n: number): string {
  if (n <= 0) return "";
  if (n === 1) return "+1 lokalizacja";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `+${n} lokalizacje`;
  }
  return `+${n} lokalizacji`;
}

export default function WmsPickingProductsPage() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const routeParams = useParams<{ orderId?: string }>();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { setPickingCart, clearPickingCart, snapshot } = useWmsPickingCart();
  const {
    registerScanHandler,
    setActiveDocument,
    showScannerToast,
    showScanFeedbackFromCode,
    setScannerInputPlaceholder,
    appendScanToHistory,
    refocusScannerInput,
  } = useWmsScanner();

  const navPick = (routerLocation.state as WmsPickingProductsNavState | null)?.pickingSession ?? null;
  const ridFromRoute =
    routeParams.orderId != null && String(routeParams.orderId).trim() !== "" ? Number(routeParams.orderId) : NaN;
  const routeRecoveryOk = Number.isFinite(ridFromRoute) && ridFromRoute > 0;

  const pickingSession = useMemo(() => {
    const rid = routeRecoveryOk ? ridFromRoute : navPick?.recoveryOrderId ?? null;
    if (navPick) {
      if (rid != null && rid > 0 && (navPick.recoveryOrderId == null || navPick.recoveryOrderId !== rid)) {
        return { ...navPick, recoveryOrderId: rid };
      }
      return navPick;
    }
    if (rid != null && rid > 0) {
      return {
        orderUiStatusId: 1,
        orderUiStatusName: "Dogrywka zbierki",
        orderUiStatusColor: "#4f46e5",
        mainGroup: "IN_PROGRESS" as const,
        orderTypeChoice: "all" as const,
        recoveryOrderId: rid,
      };
    }
    return null;
  }, [navPick, routeRecoveryOk, ridFromRoute]);

  const recoveryOrderId = pickingSession?.recoveryOrderId ?? null;
  const orderType = pickingSession?.orderTypeChoice ?? "all";
  const mergedSession = useMergedPickingSession(pickingSession, DAMAGE_TENANT_ID, warehouseId);

  const sessionFingerprint = useMemo(
    () =>
      pickingSession && warehouseId != null
        ? `${pickingSession.orderUiStatusId}-${orderType}-${warehouseId}-r${recoveryOrderId ?? ""}`
        : "",
    [pickingSession, orderType, warehouseId, recoveryOrderId],
  );

  const bootstrapAttemptedRef = useRef<string | null>(null);
  const productLinesLoadSeqRef = useRef(0);
  const productLinesLoadKeyRef = useRef("");
  const productLinesForceNextLoadRef = useRef(false);
  const pickingListRefreshHandledRef = useRef<number | null>(null);
  const recoveryExitRef = useRef(false);
  useEffect(() => {
    bootstrapAttemptedRef.current = null;
    productLinesLoadKeyRef.current = "";
    pickingListRefreshHandledRef.current = null;
  }, [sessionFingerprint]);

  const [rows, setRows] = useState<WmsPickingProductLineApi[]>([]);
  const [bundlePickScan, setBundlePickScan] = useState<BundleScanOut | null>(null);
  const [cohortOrderCount, setCohortOrderCount] = useState(0);
  const [sessionStats, setSessionStats] = useState<WmsPickingSessionStatsApi | null>(null);
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cohortMissingLines, setCohortMissingLines] = useState<WmsPickingCohortMissingLineApi[]>([]);
  const [allowContinueAfterShortage, setAllowContinueAfterShortage] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [recoveryCompleted, setRecoveryCompleted] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeErr, setFinalizeErr] = useState<string | null>(null);
  const [finalizeFailingPick, setFinalizeFailingPick] = useState<{
    product_id?: number;
    pick_id?: number;
    product_name?: string;
    location_code?: string;
    quantity?: number;
  } | null>(null);
  const [finalizeShortageModal, setFinalizeShortageModal] = useState<
    null | {
      products: number;
      units: number;
      orderIds: number[];
      missingLines: WmsPickingCohortMissingLineApi[];
    }
  >(null);
  const [cartBootstrapErr, setCartBootstrapErr] = useState<string | null>(null);
  const [cartBootstrapping, setCartBootstrapping] = useState(false);
  const [basketPutPending, setBasketPutPending] = useState<WmsBasketPutPendingListApi | null>(null);
  /** SSOT from list API — true only for MULTI/baskets carts, never merely Boolean(cartId). */
  const [requiresBasketPutConfirm, setRequiresBasketPutConfirm] = useState(false);
  const listScanGateRef = useRef(false);
  const [cancelPendingBusy, setCancelPendingBusy] = useState(false);
  const [activePriorityTask, setActivePriorityTask] = useState<ActivePriorityTask | null>(() => {
    const task = loadActivePriorityTask();
    return priorityTaskAppliesTo(task, "picking") ? task : null;
  });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const activePriorityOrderIds = useMemo(() => priorityTaskOrderIds(activePriorityTask), [activePriorityTask]);

  const isCartlessMode = useMemo(() => {
    if (!pickingSession) return false;
    if (pickingSession.cartless || (pickingSession.pickingSessionId != null && pickingSession.pickingSessionId > 0)) {
      return true;
    }
    if (pickingSession.cartId != null && pickingSession.cartId > 0) return false;
    const choice = pickingSession.orderTypeChoice ?? "all";
    const single = pickingSession.singleMode as PickingFlowMode | undefined;
    const multi = pickingSession.multiMode as PickingFlowMode | undefined;
    if (choice === "single") return single === "cart_no_scan";
    if (choice === "multi") return multi === "cart_no_scan";
    const needsScan = modeRequiresCartScan(single ?? "cart_no_scan") || modeRequiresCartScan(multi ?? "cart_no_scan");
    if (needsScan) return false;
    return single === "cart_no_scan" || multi === "cart_no_scan";
  }, [pickingSession]);

  const productLinesLoadKey = useMemo(() => {
    if (warehouseId == null || !pickingSession) return "";
    // Cartless: nie ładuj listy produktów zanim sesja nie wystartuje (unikaj kohorty statusu).
    if (isCartlessMode && !(mergedSession?.pickingSessionId != null && mergedSession.pickingSessionId > 0)) {
      return "";
    }
    return [
      warehouseId,
      pickingSession.orderUiStatusId,
      orderType,
      mergedSession?.cartId ?? "",
      mergedSession?.pickingSessionId ?? "",
      recoveryOrderId ?? "",
      activePriorityOrderIds.join(","),
    ].join("|");
  }, [
    warehouseId,
    pickingSession,
    orderType,
    mergedSession?.cartId,
    mergedSession?.pickingSessionId,
    recoveryOrderId,
    activePriorityOrderIds,
    isCartlessMode,
  ]);

  useEffect(() => {
    const sync = () => {
      const task = loadActivePriorityTask();
      setActivePriorityTask(priorityTaskAppliesTo(task, "picking") ? task : null);
    };
    window.addEventListener("wms:priority-task-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("wms:priority-task-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!pickingSession || warehouseId == null) return;

    // Cartless: start sesji bez default-cart / WarehouseCart.
    if (isCartlessMode) {
      if (mergedSession?.pickingSessionId != null && mergedSession.pickingSessionId > 0) {
        setCartBootstrapErr(null);
        setCartBootstrapping(false);
        clearPickingCart();
        return;
      }
      if (!sessionFingerprint) return;
      if (bootstrapAttemptedRef.current === sessionFingerprint) return;
      bootstrapAttemptedRef.current = sessionFingerprint;

      let cancelled = false;
      setCartBootstrapping(true);
      setCartBootstrapErr(null);
      clearPickingCart();

      (async () => {
        try {
          const r = await postWmsPickingStartCartless(
            DAMAGE_TENANT_ID,
            warehouseId,
            pickingSession.orderUiStatusId,
            orderType,
            activePriorityOrderIds.length ? activePriorityOrderIds : undefined,
          );
          if (cancelled) return;
          if (r.session_id == null || r.session_id < 1) {
            setCartBootstrapErr(
              r.operator_message?.trim() ||
                "Brak zamówień do przypisania do sesji zbierania (walidacja / limity).",
            );
            return;
          }
          const prevSt = routerLocation.state as WmsPickingProductsNavState | null;
          const refreshAt = prevSt?.pickingListRefreshAt;
          navigate(routerLocation.pathname, {
            replace: true,
            state: {
              pickingSession: {
                ...pickingSession,
                cartId: null,
                cartCode: null,
                cartName: null,
                cartless: true,
                pickingSessionId: r.session_id,
                assignEmptyMessage: r.operator_message ?? null,
              },
              ...(refreshAt != null && Number.isFinite(refreshAt) ? { pickingListRefreshAt: refreshAt } : {}),
            } satisfies WmsPickingProductsNavState,
          });
        } catch (e) {
          if (!cancelled) {
            setCartBootstrapErr(
              extractApiErrorMessage(e, "Nie udało się rozpocząć zbierania bez wózka."),
            );
          }
        } finally {
          if (!cancelled) setCartBootstrapping(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    if (mergedSession?.cartId != null) {
      setCartBootstrapErr(null);
      setCartBootstrapping(false);
      const cartCode = (mergedSession.cartCode ?? "").trim() || `Wózek #${mergedSession.cartId}`;
      const cartName = (mergedSession.cartName ?? "").trim();
      const ctxMatch =
        snapshot != null &&
        snapshot.tenantId === DAMAGE_TENANT_ID &&
        snapshot.warehouseId === warehouseId;
      if (
        !ctxMatch ||
        snapshot.cartId !== mergedSession.cartId ||
        snapshot.cartCode !== cartCode ||
        (snapshot.cartName ?? "") !== cartName
      ) {
        setPickingCart({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId,
          cartId: mergedSession.cartId,
          cartCode,
          cartName: cartName || undefined,
        });
      }
      if (
        pickingSession.cartId !== mergedSession.cartId ||
        (pickingSession.cartCode ?? "").trim() !== cartCode ||
        (pickingSession.cartName ?? "").trim() !== cartName
      ) {
        const prevSt = routerLocation.state as WmsPickingProductsNavState | null;
        const refreshAt = prevSt?.pickingListRefreshAt;
        navigate(routerLocation.pathname, {
          replace: true,
          state: {
            pickingSession: {
              ...pickingSession,
              cartId: mergedSession.cartId,
              cartCode,
              cartName: cartName || null,
            },
            ...(refreshAt != null && Number.isFinite(refreshAt) ? { pickingListRefreshAt: refreshAt } : {}),
          } satisfies WmsPickingProductsNavState,
        });
      }
      return;
    }
    if (!sessionFingerprint) return;
    if (bootstrapAttemptedRef.current === sessionFingerprint) return;
    bootstrapAttemptedRef.current = sessionFingerprint;

    let cancelled = false;
    setCartBootstrapping(true);
    setCartBootstrapErr(null);

    (async () => {
      try {
        const code = (pickingSession.cartCode ?? "").trim();
        let r;
        if (code) {
          try {
            r = await getWmsPickingResolveCart(DAMAGE_TENANT_ID, warehouseId, code);
          } catch {
            r = await getWmsPickingDefaultCart(DAMAGE_TENANT_ID, warehouseId);
          }
        } else {
          r = await getWmsPickingDefaultCart(DAMAGE_TENANT_ID, warehouseId);
        }
        if (cancelled) return;
        const cartCode = (r.code && r.code.trim()) || r.barcode?.trim() || `Wózek #${r.cart_id}`;
        const cartName =
          (r.display_name && r.display_name.trim()) || (r.name && r.name.trim()) || undefined;
        setPickingCart({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId,
          cartId: r.cart_id,
          cartCode,
          cartName,
        });
        const prevSt2 = routerLocation.state as WmsPickingProductsNavState | null;
        const refreshAt2 = prevSt2?.pickingListRefreshAt;
        navigate(routerLocation.pathname, {
          replace: true,
          state: {
            pickingSession: {
              ...pickingSession,
              cartId: r.cart_id,
              cartCode,
              cartName: cartName ?? null,
            },
            ...(refreshAt2 != null && Number.isFinite(refreshAt2) ? { pickingListRefreshAt: refreshAt2 } : {}),
          } satisfies WmsPickingProductsNavState,
        });
      } catch {
        if (!cancelled) {
          setCartBootstrapErr(
            "Nie udało się ustalić aktywnego wózka. Dodaj co najmniej jeden wózek BULK w tym magazynie lub zeskanuj kod wózka.",
          );
        }
      } finally {
        if (!cancelled) setCartBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pickingSession,
    warehouseId,
    mergedSession?.cartId,
    mergedSession?.cartCode,
    mergedSession?.cartName,
    mergedSession?.pickingSessionId,
    sessionFingerprint,
    navigate,
    routerLocation.pathname,
    setPickingCart,
    clearPickingCart,
    snapshot,
    isCartlessMode,
    orderType,
    activePriorityOrderIds,
  ]);

  const load = useCallback(async () => {
    if (warehouseId == null || !pickingSession) {
      setRows([]);
      setCohortOrderCount(0);
      return;
    }
    const force = productLinesForceNextLoadRef.current;
    productLinesForceNextLoadRef.current = false;
    const seq = ++productLinesLoadSeqRef.current;
    setLoading(true);
    setErr(null);
    setRecoveryCompleted(false);
    try {
      const data = await getWmsPickingProductLines(
        DAMAGE_TENANT_ID,
        warehouseId,
        pickingSession.orderUiStatusId,
        orderType,
        isCartlessMode ? null : mergedSession?.cartId ?? null,
        recoveryOrderId,
        activePriorityOrderIds,
        {
          force,
          pickingSessionId: isCartlessMode ? mergedSession?.pickingSessionId ?? null : null,
        },
      );
      if (seq !== productLinesLoadSeqRef.current) {
        return;
      }
      const completed = Boolean(data.recovery_completed);
      setRecoveryCompleted(completed);
      const normalized = data.products.map((r) => ({
        ...r,
        picked_quantity: wmsPickingEffectivePickedQuantity(r),
      }));
      setRows(normalized);
      setCohortOrderCount(typeof data.cohort_order_count === "number" ? data.cohort_order_count : 0);
      if (data.session_stats) {
        setSessionStats({
          zebrane: data.session_stats.zebrane ?? 0,
          do_zebrania: data.session_stats.do_zebrania ?? 0,
          w_trakcie: data.session_stats.w_trakcie ?? 0,
          braki: data.session_stats.braki ?? 0,
        });
      }
      setCohortMissingLines(data.cohort_missing_lines ?? []);
      setAllowContinueAfterShortage(data.allow_continue_other_lines_after_shortage !== false);
      setWarnings(data.warnings ?? []);
      setBasketPutPending(
        data.basket_put_pending && data.basket_put_pending.product_id
          ? data.basket_put_pending
          : null,
      );
      setRequiresBasketPutConfirm(Boolean(data.requires_basket_put_confirm));
      if (completed) {
        setErr(null);
      }
    } catch (e) {
      if (seq !== productLinesLoadSeqRef.current) {
        return;
      }
      const ax = e as { response?: { status?: number; data?: { detail?: unknown } } };
      const detail = ax.response?.data?.detail;
      const code =
        detail && typeof detail === "object" && detail !== null && "code" in detail
          ? String((detail as { code: string }).code)
          : "";
      const apiErr =
        detail && typeof detail === "object" && detail !== null && "error" in detail
          ? String((detail as { error: string }).error)
          : "";
      if (
        recoveryOrderId != null &&
        recoveryOrderId > 0 &&
        (code === "RECOVERY_ALREADY_COMPLETED" || code === "RECOVERY_ORDER_NOT_FOUND")
      ) {
        setRecoveryCompleted(code === "RECOVERY_ALREADY_COMPLETED");
        setErr(
          apiErr ||
            (code === "RECOVERY_ALREADY_COMPLETED"
              ? "Braki zostały już rozwiązane."
              : "Nie znaleziono zamówienia dogrywki."),
        );
      } else {
        setErr(apiErr || "Nie udało się wczytać listy produktów.");
      }
      setRows([]);
      setCohortOrderCount(0);
      setWarnings([]);
      setBasketPutPending(null);
      setRequiresBasketPutConfirm(false);
    } finally {
      if (seq === productLinesLoadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [
    warehouseId,
    pickingSession,
    orderType,
    mergedSession?.cartId,
    mergedSession?.pickingSessionId,
    recoveryOrderId,
    activePriorityOrderIds,
    isCartlessMode,
  ]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!pickingSession) {
      navigate(WMS_ROUTES.picking, { replace: true });
      return;
    }
    if (!productLinesLoadKey || productLinesLoadKeyRef.current === productLinesLoadKey) {
      return;
    }
    productLinesLoadKeyRef.current = productLinesLoadKey;
    void loadRef.current();
  }, [pickingSession, navigate, productLinesLoadKey]);

  useEffect(() => {
    const st = routerLocation.state as WmsPickingProductsNavState | null;
    const at = st?.pickingListRefreshAt;
    if (at == null || !Number.isFinite(at) || pickingSession == null) return;
    if (pickingListRefreshHandledRef.current === at) return;
    const nextSession = st?.pickingSession;
    if (!nextSession) return;
    pickingListRefreshHandledRef.current = at;
    productLinesForceNextLoadRef.current = true;
    void loadRef.current();
    navigate(routerLocation.pathname, {
      replace: true,
      state: { pickingSession: nextSession } satisfies WmsPickingProductsNavState,
    });
  }, [routerLocation.state, routerLocation.pathname, pickingSession, navigate]);

  useWmsShortagesRefresh(
    () => {
      if (recoveryOrderId != null && recoveryOrderId > 0) return;
      productLinesLoadKeyRef.current = "";
      productLinesForceNextLoadRef.current = true;
      void loadRef.current();
    },
    { enabled: recoveryOrderId == null || recoveryOrderId <= 0, debounceMs: 700 },
  );

  useEffect(() => {
    setActiveDocument({
      kind: "picking",
      label: recoveryOrderId != null && recoveryOrderId > 0 ? "Dogrywka zbierki" : "Zbieranie — produkty",
    });
    return () => setActiveDocument(null);
  }, [setActiveDocument, recoveryOrderId]);

  useEffect(() => {
    if (basketPutPending?.product_id) {
      setScannerInputPlaceholder("Najpierw odłóż produkt do koszyka");
    } else {
      setScannerInputPlaceholder("Skanuj EAN lub id produktu");
    }
    refocusScannerInput();
  }, [setScannerInputPlaceholder, refocusScannerInput, rows.length, basketPutPending]);

  const shortageProductIds = useMemo(
    () => new Set((cohortMissingLines ?? []).map((l) => l.product_id)),
    [cohortMissingLines],
  );
  const blockOtherProductLines =
    recoveryOrderId == null && !allowContinueAfterShortage && shortageProductIds.size > 0;

  const goDetail = useCallback(
    (
      productId: number,
      opts: {
        source: PickingDetailNavSource;
        caller: string;
        rawCode?: string | null;
        quickPickCalled: boolean;
        quickPickResponse?: string | null;
        pendingCreated: boolean;
        listProductScanToken?: string | null;
        basketPutPendingSeed?: WmsPickingProductsNavState["basketPutPendingSeed"];
      },
    ) => {
      if (!mergedSession) return;
      if (blockOtherProductLines && !shortageProductIds.has(productId)) {
        return;
      }
      const state = preparePickingProductDetailNavigation(mergedSession, {
        productId,
        source: opts.source,
        caller: opts.caller,
        rawCode: opts.rawCode ?? null,
        quickPickCalled: opts.quickPickCalled,
        quickPickResponse: opts.quickPickResponse ?? null,
        pendingCreated: opts.pendingCreated,
        listProductScanToken: opts.listProductScanToken,
        basketPutPendingSeed: opts.basketPutPendingSeed,
      });
      if (!state) return;
      navigate(WMS_ROUTES.pickingProduct(productId), { state });
    },
    [navigate, mergedSession, blockOtherProductLines, shortageProductIds],
  );

  useEffect(() => {
    const handler = async (ean: string) => {
      const scan = normalizeScanEan(ean);
      if (!scan || rows.length === 0 || !mergedSession || warehouseId == null) {
        return SCAN_NOT_CONSUMED;
      }
      if (listScanGateRef.current) {
        multiScanTrace("LIST_SCAN_BUSY", { raw_code: scan, consumed: true });
        return SCAN_CONSUMED;
      }

      multiScanTrace("PRODUCT_CLASSIFIED", {
        raw_code: scan,
        via: "list",
        cart_id: mergedSession.cartId ?? null,
        requires_basket_put: requiresBasketPutConfirm,
        pending_before: Boolean(basketPutPending?.product_id),
      });

      const matches = rows.filter((r) => productLineMatchesScan(r, scan));
      const hit = matches.find((r) => rowScannerEligible(r));
      const completeHit = matches.find((r) => wmsPickingProductLineComplete(r));

      if (basketPutPending && basketPutPending.product_id > 0) {
        const pendingMatches =
          hit?.product_id === basketPutPending.product_id ||
          productLineMatchesScan(
            {
              product_id: basketPutPending.product_id,
              ean: basketPutPending.ean ?? null,
              name: basketPutPending.product_name ?? "",
              total_quantity: 1,
              picked_quantity: 0,
            } as WmsPickingProductLineApi,
            scan,
          );
        const listDecision = resolveMultiPickingListScan(scan, {
          hasPending: true,
          pendingProductMatchesScan: Boolean(pendingMatches || hit?.product_id === basketPutPending.product_id),
          productHitEligible: Boolean(hit),
          productHitComplete: Boolean(completeHit && !hit),
          requiresBasketPut: true,
        });
        multiScanTrace("LIST_SCAN", {
          raw_code: scan,
          classified_as: listDecision.kind,
          code: listDecision.kind === "reject" ? listDecision.code : null,
          pending_product_id: basketPutPending.product_id,
        });
        if (listDecision.kind === "reject") {
          showScanFeedbackFromCode(listDecision.code);
          appendScanToHistory(scan);
          return SCAN_CONSUMED;
        }
        if (listDecision.kind === "resume_pending_detail") {
          playScanBeep();
          appendScanToHistory(scan);
          showScannerToast("Odłóż produkt do koszyka");
          multiScanTrace("NAVIGATE_DETAIL", {
            product_id: basketPutPending.product_id,
            navigation_source: "list_resume_pending",
            pending_after: true,
          });
          goDetail(basketPutPending.product_id, {
            source: "pending_resume",
            caller: "list_resume_pending_scan",
            rawCode: scan,
            quickPickCalled: false,
            pendingCreated: true,
            listProductScanToken: basketPutPending.idempotency_key ?? null,
            basketPutPendingSeed: {
              product_id: basketPutPending.product_id,
              quantity: basketPutPending.quantity,
              idempotency_key: basketPutPending.idempotency_key,
              eligible_baskets: basketPutPending.eligible_baskets,
            },
          });
          return SCAN_CONSUMED;
        }
        if (listDecision.kind === "confirm_basket" && mergedSession.cartId) {
          multiScanTrace("BASKET_SCAN", {
            raw_code: scan,
            classified_as: "pending_confirm",
            via: "list",
            pending_before_confirm: true,
          });
          listScanGateRef.current = true;
          try {
            const result = await postWmsPickingConfirmBasketPut(
              DAMAGE_TENANT_ID,
              warehouseId,
              mergedSession.orderUiStatusId,
              orderType,
              {
                cart_id: mergedSession.cartId,
                basket_scan: scan,
                recovery_order_id: recoveryOrderId,
              },
            );
            appendScanToHistory(scan);
            multiScanTrace("BASKET_CONFIRM_OK", {
              phase: result.phase ?? null,
              pick_delta: result.quantity_put ?? 0,
              order_id: result.order_id ?? null,
              via: "list",
            });
            if (result.phase === "SERIES_DESTINATION_SWITCHED") {
              showScanFeedbackFromCode("SERIES_DESTINATION_SWITCHED", {
                backendMessage: result.message,
              });
            } else {
              playScanBeep();
              showScannerToast(result.message ?? "Koszyk potwierdzony");
            }
            setBasketPutPending(null);
            void load();
            if (result.order_id != null && basketPutPending.product_id) {
              goDetail(basketPutPending.product_id, {
                source: "other",
                caller: "list_after_basket_confirm",
                rawCode: scan,
                quickPickCalled: false,
                pendingCreated: false,
              });
            }
            return SCAN_CONSUMED;
          } catch (e: unknown) {
            const extracted = extractWmsScanErrorDetail(e);
            showScanFeedbackFromCode(extracted.code ?? "UNKNOWN_SCAN_CODE", {
              backendMessage: extracted.message,
              contextHint: extracted.eligibleLabels,
            });
            void load();
            return SCAN_CONSUMED;
          } finally {
            listScanGateRef.current = false;
          }
        }
        showScanFeedbackFromCode("EXPECTED_BASKET_SCAN");
        appendScanToHistory(scan);
        return SCAN_CONSUMED;
      }

      if (requiresBasketPutConfirm) {
        const selectDecision = resolveMultiPickingListScan(scan, {
          hasPending: false,
          pendingProductMatchesScan: false,
          productHitEligible: Boolean(hit),
          productHitComplete: Boolean(completeHit && !hit),
          requiresBasketPut: true,
        });
        if (selectDecision.kind === "reject") {
          multiScanTrace("LIST_SCAN", {
            raw_code: scan,
            classified_as: "reject",
            code: selectDecision.code,
            consumed: true,
          });
          showScanFeedbackFromCode(selectDecision.code);
          appendScanToHistory(scan);
          return SCAN_CONSUMED;
        }
      }

      if (mergedSession.cartId != null && mergedSession.cartId > 0 && !requiresBasketPutConfirm) {
        const stockRow = rows.find((r) => {
          const e = normalizeScanEan(r.ean ?? "").toUpperCase();
          const s = scan.toUpperCase();
          return e === s || String(r.product_id) === s;
        });
        try {
          const bundle = await tryPickingBundleScan({
            tenantId: DAMAGE_TENANT_ID,
            barcode: scan,
            cartId: mergedSession.cartId,
            sourceStatusId: mergedSession.orderUiStatusId,
            orderType,
            locationId: stockRow?.primary_location_id ?? stockRow?.locations?.[0]?.location_id ?? null,
          });
          if (bundle.handled) {
            playScanBeep();
            appendScanToHistory(scan);
            if (bundle.scan) setBundlePickScan(bundle.scan);
            if (bundle.toast) showScannerToast(bundle.toast);
            if (bundle.refresh) void load();
            return SCAN_CONSUMED;
          }
        } catch {
          /* fall through */
        }
      }

      if (hit) {
        if (blockOtherProductLines && !shortageProductIds.has(hit.product_id)) {
          showScannerToast("Najpierw domknij zgłoszony brak — inne linie są zablokowane.");
          return SCAN_CONSUMED;
        }

        // DEFAULT QUANTITY MODE (MULTI): EAN = SELECT PRODUCT only (no pending, no Pick).
        if (requiresBasketPutConfirm) {
          playScanBeep();
          appendScanToHistory(scan);
          showScannerToast(hit.name);
          multiScanTrace("NAVIGATE_DETAIL", {
            product_id: hit.product_id,
            navigation_source: "list_ean_select_product",
            pending_after: false,
            quick_pick_called: false,
          });
          goDetail(hit.product_id, {
            source: "physical_scan",
            caller: "list_ean_select_product",
            rawCode: scan,
            quickPickCalled: false,
            pendingCreated: false,
            listProductScanToken: `select-${hit.product_id}-${Date.now()}`,
          });
          return SCAN_CONSUMED;
        }

        const { total } = wmsPickingDisplayProgressParts(hit);
        const locId = hit.primary_location_id ?? hit.locations?.[0]?.location_id ?? null;
        const canQuickPick =
          locId != null &&
          (mergedSession.cartId != null ||
            (mergedSession.pickingSessionId != null && mergedSession.pickingSessionId > 0));

        if (canQuickPick) {
          listScanGateRef.current = true;
          try {
            multiScanTrace("PRODUCT_SCAN_REQUEST_START", {
              product_id: hit.product_id,
              location_id: locId,
              cart_id: mergedSession.cartId ?? null,
              via: "list",
              pending_before: false,
            });
            const result = await postWmsPickingQuickPick(
              DAMAGE_TENANT_ID,
              warehouseId,
              mergedSession.orderUiStatusId,
              orderType,
              {
                product_id: hit.product_id,
                location_id: locId,
                quantity: 1,
                ...(mergedSession.pickingSessionId != null && mergedSession.pickingSessionId > 0
                  ? { picking_session_id: mergedSession.pickingSessionId }
                  : { cart_id: mergedSession.cartId! }),
                ...(recoveryOrderId != null && recoveryOrderId > 0
                  ? { recovery_order_id: recoveryOrderId }
                  : {}),
              },
            );
            multiScanTrace("PRODUCT_SCAN_RESPONSE", {
              product_id: hit.product_id,
              phase: result.phase ?? null,
              picked: result.picked ?? null,
              pending_after: Boolean(result.pending),
              response_code: result.phase ?? (result.picked ? "PUT_CONFIRMED" : "OK"),
            });
            playScanBeep();
            appendScanToHistory(scan);
            if (result.phase === "AWAITING_BASKET_CONFIRMATION" || result.picked === false) {
              multiScanTrace("PENDING_CREATED", {
                product_id: hit.product_id,
                pending_created: Boolean(result.pending),
                phase: result.phase ?? "AWAITING_BASKET_CONFIRMATION",
                pick_delta: 0,
                via: "list",
              });
              const seed = {
                product_id: result.pending?.product_id ?? hit.product_id,
                quantity: result.pending?.quantity ?? 1,
                idempotency_key: result.pending?.idempotency_key,
                eligible_baskets: result.pending?.eligible_baskets ?? result.eligible_baskets,
              };
              if (seed.product_id) {
                setBasketPutPending({
                  product_id: seed.product_id,
                  quantity: seed.quantity ?? 1,
                  idempotency_key: seed.idempotency_key,
                  eligible_baskets: seed.eligible_baskets,
                  ean: hit.ean ?? null,
                  product_name: hit.name,
                  sku: hit.sku ?? null,
                } as WmsBasketPutPendingListApi);
              }
              showScannerToast(result.message ?? hit.name);
              multiScanTrace("NAVIGATE_DETAIL", {
                product_id: hit.product_id,
                navigation_source: "list_product_scan_awaiting_basket",
                pending_after: true,
              });
              goDetail(hit.product_id, {
                source: "physical_scan",
                caller: "list_product_scan_awaiting_basket",
                rawCode: scan,
                quickPickCalled: true,
                quickPickResponse: result.phase ?? "AWAITING_BASKET_CONFIRMATION",
                pendingCreated: true,
                listProductScanToken: seed.idempotency_key ?? `scan-${Date.now()}`,
                basketPutPendingSeed: seed,
              });
              return SCAN_CONSUMED;
            }
            showScannerToast(`Zebrano: ${hit.name}`);
            void load();
            return SCAN_CONSUMED;
          } catch (e: unknown) {
            const code =
              axios.isAxiosError(e) &&
              e.response?.data &&
              typeof e.response.data === "object" &&
              (e.response.data as { detail?: { code?: string } }).detail &&
              typeof (e.response.data as { detail?: { code?: string } }).detail === "object"
                ? (e.response.data as { detail: { code?: string; pending?: { product_id?: number; idempotency_key?: string } } })
                    .detail.code
                : undefined;
            const pendingProductId =
              axios.isAxiosError(e) &&
              e.response?.data &&
              typeof e.response.data === "object" &&
              typeof (e.response.data as { detail?: { pending?: { product_id?: number } } }).detail?.pending
                ?.product_id === "number"
                ? (e.response.data as { detail: { pending: { product_id: number; idempotency_key?: string } } }).detail
                    .pending.product_id
                : null;
            const pendingKey =
              axios.isAxiosError(e) &&
              e.response?.data &&
              typeof e.response.data === "object"
                ? (e.response.data as { detail?: { pending?: { idempotency_key?: string } } }).detail?.pending
                    ?.idempotency_key
                : undefined;
            multiScanTrace("PRODUCT_SCAN_RESPONSE", {
              product_id: hit.product_id,
              response_code: code ?? "ERROR",
              pending_after: pendingProductId != null,
            });
            if (
              (code === "AWAITING_BASKET_CONFIRMATION" ||
                code === "EXPECTED_BASKET_SCAN" ||
                code === "PENDING_PUT_EXISTS") &&
              pendingProductId != null
            ) {
              playScanBeep();
              appendScanToHistory(scan);
              const detailPending =
                axios.isAxiosError(e) && e.response?.data && typeof e.response.data === "object"
                  ? (e.response.data as { detail?: { pending?: WmsBasketPutPendingListApi } }).detail?.pending
                  : undefined;
              showScanFeedbackFromCode(code);
              multiScanTrace("NAVIGATE_DETAIL", {
                product_id: pendingProductId,
                navigation_source: "list_product_scan_already_pending",
                pending_after: true,
              });
              goDetail(pendingProductId, {
                source: "physical_scan",
                caller: "list_product_scan_already_pending",
                rawCode: scan,
                quickPickCalled: true,
                quickPickResponse: code,
                pendingCreated: true,
                listProductScanToken: pendingKey ?? null,
                basketPutPendingSeed: detailPending
                  ? {
                      product_id: detailPending.product_id,
                      quantity: detailPending.quantity,
                      idempotency_key: detailPending.idempotency_key,
                      eligible_baskets: detailPending.eligible_baskets,
                    }
                  : { product_id: pendingProductId, quantity: 1, idempotency_key: pendingKey ?? undefined },
              });
              return SCAN_CONSUMED;
            }
            if (code) {
              showScanFeedbackFromCode(code, {
                backendMessage: extractApiErrorMessage(e, undefined),
              });
              appendScanToHistory(scan);
              return SCAN_CONSUMED;
            }
            if (requiresBasketPutConfirm) {
              showScanFeedbackFromCode("UNKNOWN_SCAN_CODE", {
                backendMessage: extractApiErrorMessage(e, "Nie udało się zarejestrować skanu produktu."),
              });
              appendScanToHistory(scan);
              return SCAN_CONSUMED;
            }
            // Non-MULTI: open detail without inventing pending (never physical_scan without quick-pick success).
            if (total === 1) {
              showScannerToast(
                extractApiErrorMessage(e, "Zapis szybkiego pobrania nie powiódł się — otwarcie detalu."),
              );
            } else {
              playScanBeep();
              appendScanToHistory(scan);
              showScannerToast(hit.name);
            }
            goDetail(hit.product_id, {
              source: "other",
              caller: "list_quick_pick_error_fallback_non_multi",
              rawCode: scan,
              quickPickCalled: true,
              quickPickResponse: "ERROR",
              pendingCreated: false,
            });
            return SCAN_CONSUMED;
          } finally {
            listScanGateRef.current = false;
          }
        }

        if (requiresBasketPutConfirm) {
          showScanFeedbackFromCode("UNKNOWN_SCAN_CODE", {
            backendMessage: "Brak lokalizacji dla produktu — nie można utworzyć oczekującego odłożenia.",
          });
          appendScanToHistory(scan);
          return SCAN_CONSUMED;
        }
        playScanBeep();
        appendScanToHistory(scan);
        showScannerToast(hit.name);
        goDetail(hit.product_id, {
          source: "other",
          caller: "list_no_location_non_multi",
          rawCode: scan,
          quickPickCalled: false,
          pendingCreated: false,
        });
        return SCAN_CONSUMED;
      } else if (matches.length > 0) {
        showScanFeedbackFromCode("PRODUCT_ALREADY_COMPLETE");
        appendScanToHistory(scan);
        return SCAN_CONSUMED;
      } else if (requiresBasketPutConfirm) {
        showScanFeedbackFromCode("PRODUCT_NOT_IN_PICKING");
        appendScanToHistory(scan);
        return SCAN_CONSUMED;
      }
      return SCAN_NOT_CONSUMED;
    };
    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [
    registerScanHandler,
    rows,
    appendScanToHistory,
    showScannerToast,
    showScanFeedbackFromCode,
    goDetail,
    blockOtherProductLines,
    shortageProductIds,
    mergedSession,
    warehouseId,
    orderType,
    recoveryOrderId,
    load,
    basketPutPending,
    requiresBasketPutConfirm,
  ]);

  const resumePendingPut = useCallback(() => {
    if (!basketPutPending?.product_id) return;
    goDetail(basketPutPending.product_id, {
      source: "pending_resume",
      caller: "list_resume_pending_button",
      quickPickCalled: false,
      pendingCreated: true,
      listProductScanToken: basketPutPending.idempotency_key ?? null,
      basketPutPendingSeed: {
        product_id: basketPutPending.product_id,
        quantity: basketPutPending.quantity,
        idempotency_key: basketPutPending.idempotency_key,
        eligible_baskets: basketPutPending.eligible_baskets,
      },
    });
  }, [basketPutPending, goDetail]);

  const cancelPendingPut = useCallback(async () => {
    if (!basketPutPending || !mergedSession?.cartId || warehouseId == null) return;
    if (
      !window.confirm(
        "Anulować pobranie? Sztuka nie została jeszcze odłożona do koszyka — nie cofnie to żadnego zapisanego PICK.",
      )
    ) {
      return;
    }
    setCancelPendingBusy(true);
    try {
      await postWmsPickingCancelPendingBasketPut(DAMAGE_TENANT_ID, warehouseId, {
        cart_id: mergedSession.cartId,
      });
      setBasketPutPending(null);
      showScannerToast("Pobranie anulowane — możesz zbierać dalej.");
      void load();
    } catch (e: unknown) {
      showScannerToast(extractApiErrorMessage(e, "Nie udało się anulować pobrania."));
    } finally {
      setCancelPendingBusy(false);
    }
  }, [basketPutPending, mergedSession?.cartId, warehouseId, showScannerToast, load]);

  const orderTypeLine = useMemo(() => {
    if (!pickingSession) return null;
    const c = pickingSession.orderTypeChoice;
    if (c === "single") return "Jednoelementowe";
    if (c === "multi") return "Wieloelementowe";
    if (c === "all") return "Wszystkie zamówienia";
    return "Wszystkie zamówienia";
  }, [pickingSession]);

  const sortedRows = useMemo(() => sortWmsPickingProductLinesPickFlow(rows), [rows]);

  const allPicked = useMemo(
    () => rows.length > 0 && rows.every((r) => wmsPickingProductLineComplete(r)),
    [rows],
  );

  const shortageSkuCount = useMemo(() => rows.filter((r) => wmsPickingLineMissingQty(r) > 1e-9).length, [rows]);

  const pickStatsForBar = useMemo(() => {
    if (sessionStats != null) {
      return {
        zebrane: sessionStats.zebrane,
        doZebrania: sessionStats.do_zebrania,
        wTrakcie: sessionStats.w_trakcie,
        braki: sessionStats.braki ?? shortageSkuCount,
      };
    }
    // While loading cart-scoped lines: never paint status-level hubPickStats (stale after detach).
    if (loading) {
      return null;
    }
    return pickingSession?.hubPickStats ?? { zebrane: 0, doZebrania: 0, wTrakcie: 0, braki: shortageSkuCount };
  }, [sessionStats, loading, pickingSession?.hubPickStats, shortageSkuCount]);

  const orderCountForBar = useMemo(() => {
    if (loading && rows.length === 0) {
      return null;
    }
    return cohortOrderCount;
  }, [loading, rows.length, cohortOrderCount]);

  const recoveryRemainSummary = useMemo(() => {
    let lines = 0;
    let units = 0;
    for (const r of rows) {
      const pend = wmsPickingRemainingQty(r);
      if (pend > 1e-9) {
        lines += 1;
        units += pend;
      }
    }
    return { lines, units };
  }, [rows]);

  const finalizeShortageGroups = useMemo(() => {
    const lines = finalizeShortageModal?.missingLines ?? [];
    if (lines.length === 0) return [];
    const m = new Map<number, { order_number: string; lines: WmsPickingCohortMissingLineApi[] }>();
    for (const ln of lines) {
      const cur = m.get(ln.order_id);
      if (cur) {
        cur.lines.push(ln);
      } else {
        m.set(ln.order_id, { order_number: ln.order_number, lines: [ln] });
      }
    }
    return [...m.values()].sort((a, b) => a.order_number.localeCompare(b.order_number, "pl"));
  }, [finalizeShortageModal]);

  const activeCartId = mergedSession?.cartId ?? null;
  const activePickingSessionId = mergedSession?.pickingSessionId ?? null;
  const canFinalizeSession =
    (isCartlessMode && activePickingSessionId != null && activePickingSessionId > 0) ||
    (!isCartlessMode && activeCartId != null);

  const onFinalizeCart = useCallback(async () => {
    if (!pickingSession || !mergedSession || warehouseId == null || !allPicked || !canFinalizeSession) return;
    setFinalizeBusy(true);
    setFinalizeErr(null);
    setFinalizeFailingPick(null);
    try {
      const data = await getWmsPickingProductLines(
        DAMAGE_TENANT_ID,
        warehouseId,
        pickingSession.orderUiStatusId,
        orderType,
        isCartlessMode ? null : mergedSession.cartId ?? null,
        recoveryOrderId,
        activePriorityOrderIds,
        {
          pickingSessionId: isCartlessMode ? activePickingSessionId : null,
        },
      );
      setRows(
        data.products.map((r) => ({
          ...r,
          picked_quantity: wmsPickingEffectivePickedQuantity(r),
        })),
      );
      setCohortOrderCount(typeof data.cohort_order_count === "number" ? data.cohort_order_count : 0);
      setCohortMissingLines(data.cohort_missing_lines ?? []);
      setAllowContinueAfterShortage(data.allow_continue_other_lines_after_shortage !== false);
      setWarnings(data.warnings ?? []);
      setBasketPutPending(
        data.basket_put_pending && data.basket_put_pending.product_id
          ? data.basket_put_pending
          : null,
      );
      setRequiresBasketPutConfirm(Boolean(data.requires_basket_put_confirm));
      const freshAllDone =
        data.products.length > 0 && data.products.every((r) => wmsPickingProductLineComplete(r as WmsPickingProductLineApi));
      if (!freshAllDone) {
        setFinalizeErr("Lista się zmieniła — dokończ zbiórkę przed zakończeniem.");
        return;
      }
      if (recoveryOrderId != null && recoveryOrderId > 0) {
        if (activeCartId == null) {
          setFinalizeErr("Dogrywka wymaga wózka.");
          return;
        }
        await postWmsPickingRecoveryFinalize(DAMAGE_TENANT_ID, warehouseId, recoveryOrderId, activeCartId);
        playScanBeep();
        clearPickingCart();
        dispatchWmsShortagesUpdated();
        showScannerToast("Dogrywka zakończona — wracasz do kolejki braków");
        navigate(WMS_ROUTES.braki(), { replace: true });
        return;
      }
      const fin = isCartlessMode
        ? await postWmsPickingFinalizeCartless(
            DAMAGE_TENANT_ID,
            warehouseId,
            pickingSession.orderUiStatusId,
            orderType,
            activePickingSessionId!,
          )
        : await postWmsPickingFinalizeCart(
            DAMAGE_TENANT_ID,
            warehouseId,
            pickingSession.orderUiStatusId,
            orderType,
            activeCartId!,
          );
      playScanBeep();
      clearPickingCart();
      if (pickingFinalizeHasShortageSignals(fin)) {
        setFinalizeShortageModal({
          products: fin.cohort_shortage_product_count ?? 0,
          units: fin.cohort_shortage_unit_total ?? 0,
          orderIds: fin.cohort_shortage_order_ids ?? [],
          missingLines: data.cohort_missing_lines ?? [],
        });
        productLinesLoadKeyRef.current = "";
        dispatchWmsShortagesUpdated();
      } else {
        showScannerToast("Zbieranie zakończone");
        productLinesLoadKeyRef.current = "";
        dispatchWmsShortagesUpdated();
        navigate(WMS_ROUTES.picking, {
          replace: true,
          state: { pickingListRefreshAt: Date.now() } satisfies Pick<WmsPickingProductsNavState, "pickingListRefreshAt">,
        });
      }
    } catch (e: unknown) {
      console.error("[picking.finalize]", e);
      const parsed = extractFinalizeFailingPick(e);
      if (parsed.failingPick && (parsed.code === "PICK_LOCATION_STOCK_MISMATCH" || parsed.failingPick.pick_id)) {
        const fp = parsed.failingPick;
        const qty = fp.quantity ?? fp.pick_quantity;
        const loc = fp.location_code || (fp.location_id != null ? `#${fp.location_id}` : "—");
        const name = fp.product_name || (fp.product_id != null ? `produkt #${fp.product_id}` : "produkt");
        setFinalizeErr(
          parsed.message ||
            `Nie można zakończyć zbierania.\n\nPobranie ${qty ?? "?"} szt. produktu ${name} zapisano z lokalizacji ${loc}, ale dostępny stan nie pokrywa tego pobrania.\n\nSprawdź zapisane pobranie.`,
        );
        setFinalizeFailingPick({
          product_id: fp.product_id,
          pick_id: fp.pick_id,
          product_name: fp.product_name,
          location_code: fp.location_code,
          quantity: qty,
        });
      } else {
        const msg = extractApiErrorMessage(
          e,
          "Nie udało się zakończyć zbierania z powodu niespójności danych zamówienia. Sesja nie została zakończona.",
        );
        setFinalizeErr(msg);
        setFinalizeFailingPick(null);
      }
    } finally {
      setFinalizeBusy(false);
    }
  }, [
    activeCartId,
    activePickingSessionId,
    allPicked,
    canFinalizeSession,
    clearPickingCart,
    isCartlessMode,
    load,
    mergedSession,
    navigate,
    orderType,
    pickingSession,
    showScannerToast,
    warehouseId,
    recoveryOrderId,
    activePriorityOrderIds,
  ]);

  // DEKLARACJA ZMIENNYCH BEZPIECZEŃSTWA TYPU STRUKTURALNEGO PRZED RENDERINGIEM
  const statusBadgeStyle = panelSidebarSubCountBadgeStyle(pickingSession?.orderUiStatusColor, pickingSession?.mainGroup ?? "NEW");
  const statusTitleBar =
    recoveryOrderId != null && recoveryOrderId > 0
      ? `Dogrywka #${recoveryOrderId}`
      : pickingSession?.orderUiStatusName ?? "Zbieranie";

  const totalToPickCount = rows.reduce((acc, curr) => acc + wmsPickingDisplayProgressParts(curr).total, 0);
  const totalPickedCount = rows.reduce((acc, curr) => acc + wmsPickingDisplayProgressParts(curr).pickedShown, 0);

  const exitRecoverySession = useCallback(
    async (opts?: { finalize?: boolean; toast?: string }) => {
      if (recoveryExitRef.current) return;
      recoveryExitRef.current = true;
      if (
        opts?.finalize &&
        activeCartId != null &&
        warehouseId != null &&
        recoveryOrderId != null &&
        recoveryOrderId > 0
      ) {
        try {
          await postWmsPickingRecoveryFinalize(
            DAMAGE_TENANT_ID,
            warehouseId,
            recoveryOrderId,
            activeCartId,
          );
        } catch (e: unknown) {
          console.error("[recovery.exit]", e);
        }
      }
      clearPickingCart();
      setActiveDocument(null);
      dispatchWmsShortagesUpdated();
      if (opts?.toast) showScannerToast(opts.toast);
      navigate(WMS_ROUTES.braki(), { replace: true });
    },
    [
      activeCartId,
      clearPickingCart,
      navigate,
      recoveryOrderId,
      setActiveDocument,
      showScannerToast,
      warehouseId,
    ],
  );

  const recoveryRedirecting = useMemo(() => {
    if (recoveryOrderId == null || recoveryOrderId <= 0) return false;
    if (loading || cartBootstrapping) return false;
    if (recoveryCompleted) return true;
    if (rows.length === 0) return true;
    return (
      allPicked &&
      recoveryRemainSummary.lines === 0 &&
      recoveryRemainSummary.units <= 1e-9
    );
  }, [
    allPicked,
    cartBootstrapping,
    loading,
    recoveryCompleted,
    recoveryOrderId,
    recoveryRemainSummary.lines,
    recoveryRemainSummary.units,
    rows.length,
  ]);

  useEffect(() => {
    if (!recoveryRedirecting || recoveryExitRef.current) return;
    const needsFinalize =
      rows.length > 0 &&
      allPicked &&
      recoveryRemainSummary.lines === 0 &&
      !recoveryCompleted;
    void exitRecoverySession({
      finalize: needsFinalize,
      toast: needsFinalize
        ? "Dogrywka zakończona — wracasz do kolejki braków"
        : "Braki rozwiązane — wracasz do kolejki braków",
    });
  }, [
    allPicked,
    exitRecoverySession,
    recoveryCompleted,
    recoveryRedirecting,
    recoveryRemainSummary.lines,
    rows.length,
  ]);

  const completePriorityTask = async () => {
    if (!activePriorityTask) return;
    try {
      await updateWarehousePriorityTask({ tenantId: DAMAGE_TENANT_ID, taskId: activePriorityTask.id }, { action: "complete" });
      clearActivePriorityTask(activePriorityTask.id);
      setActivePriorityTask(null);
      showScannerToast("Zadanie kierownika zakończone.");
    } catch {
      showScannerToast("Nie udało się zakończyć zadania kierownika.");
    }
  };
  const rejectPriorityTask = async () => {
    if (!activePriorityTask || !rejectReason.trim()) return;
    try {
      await updateWarehousePriorityTask(
        { tenantId: DAMAGE_TENANT_ID, taskId: activePriorityTask.id },
        { action: "reject", rejectionReason: rejectReason.trim() },
      );
      clearActivePriorityTask(activePriorityTask.id);
      setRejectOpen(false);
      setRejectReason("");
      setActivePriorityTask(null);
      navigate(WMS_ROUTES.menu, { replace: true });
    } catch {
      showScannerToast("Nie udało się odrzucić zadania.");
    }
  };

  useEffect(() => {
    if (!activePriorityTask || loading || rows.length === 0 || !allPicked) return;
    void completePriorityTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePriorityTask, allPicked, loading, rows.length]);

  if (recoveryRedirecting) {
    return (
      <WmsOperationalPageShell className="bg-slate-50/50 font-sans text-slate-900 select-none">
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Loader2 size={40} className="mb-4 animate-spin text-[#5a4fcf]" strokeWidth={2.5} />
          <p className="text-sm font-bold">Wracasz do kolejki braków…</p>
        </div>
      </WmsOperationalPageShell>
    );
  }

  return (
    <WmsOperationalPageShell className="bg-slate-50/50 font-sans text-slate-900 select-none">
      <WmsPickingSessionTopBar
        onBack={() => {
          if (
            activePriorityTask &&
            !window.confirm("Masz aktywne zadanie kierownika. Czy na pewno chcesz opuścić zadanie?")
          ) {
            return;
          }
          if (recoveryOrderId != null && recoveryOrderId > 0) {
            navigate(WMS_ROUTES.braki());
            return;
          }
          setExitModalOpen(true);
        }}
        backAriaLabel={recoveryOrderId != null && recoveryOrderId > 0 ? "Wróć do kolejki braków" : "Wróć do wyboru statusu"}
        orderCount={orderCountForBar}
        pickStats={pickStatsForBar}
        statusName={statusTitleBar}
        statusBadgeStyle={statusBadgeStyle}
        cartCode={isCartlessMode ? null : mergedSession?.cartCode}
        cartName={isCartlessMode ? null : mergedSession?.cartName}
        cartless={isCartlessMode}
        pickingSessionId={activePickingSessionId}
      />

      {basketPutPending && basketPutPending.product_id > 0 ? (
        <div className="sticky top-14 z-20 border-b border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-800">
                Masz {fmtQty(basketPutPending.quantity ?? 1)} szt. oczekującą na odłożenie do koszyka
              </p>
              <p className="mt-1 truncate text-sm font-black text-slate-900">
                {basketPutPending.product_name || `Produkt #${basketPutPending.product_id}`}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-slate-600">
                {basketPutPending.ean ? `EAN: ${basketPutPending.ean}` : null}
                {basketPutPending.ean && basketPutPending.sku ? " · " : null}
                {basketPutPending.sku ? `SKU: ${basketPutPending.sku}` : null}
                {!basketPutPending.ean && !basketPutPending.sku
                  ? `ID: ${basketPutPending.product_id}`
                  : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={resumePendingPut}
                className="rounded-xl border-2 border-amber-600 bg-amber-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:bg-amber-700 active:scale-95"
              >
                Odłóż do koszyka
              </button>
              <button
                type="button"
                disabled={cancelPendingBusy}
                onClick={() => void cancelPendingPut()}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50 active:scale-95"
              >
                {cancelPendingBusy ? "Anulowanie…" : "Anuluj pobranie"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activePriorityTask ? (
        <div className="sticky top-14 z-20 border-b border-orange-100 bg-orange-50/70 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-white px-4 py-3 shadow-sm">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-wide text-orange-700">Tryb zadania kierownika</div>
              <div className="mt-0.5 truncate text-sm font-black text-slate-900">{activePriorityTask.title}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                <span>{activePriorityTask.assigned_by_name || "Kierownik"}</span>
                <span>{activePriorityOrderIds.length || orderCountForBar || 0} zamówień</span>
                <span>od {formatOperationalDurationSince(activePriorityTask.assigned_at)}</span>
                <span>{totalPickedCount}/{totalToPickCount} szt.</span>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => void completePriorityTask()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                Zakończ zadanie
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectReason("");
                  setRejectOpen(true);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"
              >
                Odrzuć
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <WmsOperationalPageBody className="flex flex-col gap-6 animate-in fade-in duration-500 !py-4 md:!py-6">
        
        {cartBootstrapErr && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-center text-sm font-bold text-red-900 shadow-sm">{cartBootstrapErr}</p>
        )}
        {err && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-center text-sm font-bold text-red-900 shadow-sm">{err}</p>
        )}
        {blockOtherProductLines && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-950 shadow-sm">
            Zgłoszono brak — dokończ tylko dotknięte linie (SKU z brakiem). Pozostałe produkty są zablokowane.
          </p>
        )}
        {(() => {
          const bundleDisplay = bundlePickScan ? buildPickingBundleDisplay(bundlePickScan) : null;
          return bundleDisplay ? <BundlePickingScanCard display={bundleDisplay} /> : null;
        })()}
        {warnings.length > 0 && rows.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-xs text-amber-900 bg-amber-50/60 p-4 rounded-xl border border-amber-200/50">
            {warnings.map((w) => <li key={w} className="font-semibold">{w}</li>)}
          </ul>
        )}

        {!loading && !err && rows.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">
              {recoveryOrderId != null && recoveryOrderId > 0 
                ? `Dogrywka: Pozostało ${recoveryRemainSummary.lines} linii / ${fmtQty(recoveryRemainSummary.units)} szt.`
                : `Produkty w sesji (${rows.length}) • ${orderTypeLine}`}
            </span>
            <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-sm">
              Postęp: <strong className="text-slate-800 font-bold">{totalPickedCount}/{totalToPickCount} szt.</strong>
              {shortageSkuCount > 0 && <span className="text-rose-600 ml-1.5 font-bold">• Braki: {shortageSkuCount}</span>}
            </span>
          </div>
        )}

        {loading || cartBootstrapping ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <Loader2 size={40} className="animate-spin mb-4 text-[#5a4fcf]" strokeWidth={2.5} />
            <p className="font-black uppercase tracking-widest text-[11px]">{cartBootstrapping ? (isCartlessMode ? "Uruchamianie sesji zbierania…" : "Ustalanie wózka...") : "Wczytywanie pozycji..."}</p>
          </div>
        ) : null}

        {!loading && !err && rows.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm font-bold text-slate-600 shadow-sm">
            {pickingSession?.assignEmptyMessage ||
              warnings[0] ||
              "Brak pozycji do zbiórki dla tego statusu i filtra."}
          </p>
        ) : null}

        <ul className="flex list-none flex-col p-0 m-0 border-t border-slate-200/60 bg-white rounded-2xl shadow-sm overflow-hidden" aria-label="ListaBox">
          {sortedRows.map((r) => {
            const { pickedShown, total, miss, remaining } = wmsPickingDisplayProgressParts(r);
            const remainingToPick = remaining;
            const resolution = wmsPickingLineResolutionStatus(r);
            const isShortageResolved = resolution === "SHORTAGE";
            const isCompletedPick = resolution === "COMPLETED_PICK";
            const locCode = (r.primary_location_code ?? "").trim();
            const hasLocation = locCode.length > 0;
            const pStock = primaryStockDisplay(r);
            const extra = typeof r.extra_locations_count === "number" && r.extra_locations_count > 0 ? r.extra_locations_count : 0;
            const pickDone = wmsPickingProductLineComplete(r);
            const rowBlocked = blockOtherProductLines && !shortageProductIds.has(r.product_id) && !pickDone;
            const hasShortage = miss > 1e-9;

            const cardBgStyleClass = rowBlocked
              ? "cursor-not-allowed bg-slate-50/50 opacity-40"
              : isShortageResolved
                ? "bg-red-50/80 border-b border-red-100"
                : isCompletedPick
                  ? "bg-emerald-50/40 border-b border-emerald-100"
                  : "bg-white hover:bg-slate-50/60 border-b border-slate-200/60";

            const hasEan = r.ean != null && r.ean.trim() !== "";
            const titleTone = isShortageResolved
              ? "text-red-900"
              : isCompletedPick
                ? "text-emerald-800"
                : "text-slate-900";
            const nameTone = isShortageResolved
              ? "text-red-700/80"
              : isCompletedPick
                ? "text-emerald-600/75"
                : "text-slate-400 group-hover:text-[#5a4fcf]";

            return (
              <li key={r.product_id} className="last:border-b-0">
                <button
                  type="button"
                  onClick={() =>
                    goDetail(r.product_id, {
                      source: "click",
                      caller: "list_row_click",
                      quickPickCalled: false,
                      pendingCreated: false,
                    })
                  }
                  disabled={rowBlocked}
                  className={`group relative flex w-full flex-col sm:flex-row items-center justify-between p-6 gap-6 transition-all duration-150 outline-none ${cardBgStyleClass}`}
                >
                  <div className="flex items-center gap-6 min-w-0 w-full sm:w-auto flex-1 text-left">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0 bg-transparent">
                      {r.image_url ? (
                        <img
                          src={r.image_url}
                          alt=""
                          className={`max-h-full max-w-full object-contain mix-blend-multiply drop-shadow-sm transition-all duration-300 ${
                            pickDone ? "opacity-60 saturate-50" : "opacity-100"
                          }`}
                          loading="lazy"
                        />
                      ) : (
                        <ImageIcon size={28} className="text-slate-200" strokeWidth={1.5} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {hasEan && (
                        <p
                          className={`text-lg font-black tracking-tight leading-none mb-1.5 transition-colors duration-300 ${titleTone}`}
                        >
                          EAN: <span className="font-mono">{(r.ean ?? "").trim()}</span>
                        </p>
                      )}

                      <h3 className={`text-xs font-semibold leading-tight line-clamp-1 transition-colors duration-300 ${nameTone}`}>
                        {r.name}
                      </h3>
                      {r.consolidation_pick && r.consolidation_shelf_label ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-900">
                            Konsolidacja
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-violet-800">
                            {r.consolidation_shelf_label}
                          </span>
                        </div>
                      ) : null}
                      {r.bundle_breakdown && r.bundle_breakdown.length > 1 ? (
                        <ul className="mt-2 space-y-0.5 border-l-2 border-indigo-200 pl-2">
                          {r.bundle_breakdown.map((b) => (
                            <li key={`${b.order_id}-${b.bundle_id ?? "x"}`} className="text-[10px] font-semibold text-slate-500 leading-snug">
                              <span className="text-slate-700">#{b.order_number}</span>
                              {b.bundle_name ? (
                                <span className="text-indigo-700"> · {b.bundle_name}</span>
                              ) : null}
                              <span className="tabular-nums"> · ×{fmtQty(b.quantity)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center justify-center w-full sm:w-[18rem]">
                    {isShortageResolved ? (
                      <div className="flex flex-col items-stretch gap-1 w-full max-w-[240px] px-5 py-3 bg-red-50 border border-red-200 rounded-2xl text-red-900">
                        <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
                          <AlertTriangle size={16} strokeWidth={2.5} className="text-red-600 shrink-0" />
                          BRAK {fmtQty(miss)}/{fmtQty(total)}
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-red-200/80 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-800/80">
                            Zamówienie niekompletne
                          </span>
                        </div>
                        {pickedShown > 1e-9 ? (
                          <p className="text-[10px] font-semibold text-red-800/70 tabular-nums">
                            Zebrano wcześniej: {fmtQty(pickedShown)} szt.
                          </p>
                        ) : null}
                      </div>
                    ) : isCompletedPick ? (
                      <div className="flex items-center gap-2.5 px-5 py-3.5 bg-emerald-500/10 text-emerald-700 rounded-2xl border border-emerald-500/20 text-sm font-black uppercase tracking-wider">
                        <Check size={16} strokeWidth={3} />
                        Zebrano {fmtQty(pickedShown)} / {fmtQty(total)} szt.
                      </div>
                    ) : resolution === "PARTIAL" || pickedShown > 1e-9 ? (
                      <div className="flex flex-col items-stretch gap-1 w-full max-w-[220px] px-5 py-3 bg-indigo-50 border border-indigo-100 rounded-2xl group-hover:border-indigo-200 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black text-[#5a4fcf] uppercase tracking-widest">
                            Zebrano
                          </span>
                          <span className="text-sm font-black text-[#5a4fcf] tabular-nums">
                            {fmtQty(pickedShown)}/{fmtQty(total)}
                          </span>
                        </div>
                        {hasShortage ? (
                          <div className="flex items-center justify-between gap-2 border-t border-indigo-100/80 pt-1">
                            <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Brak</span>
                            <span className="text-sm font-black text-rose-700 tabular-nums">{fmtQty(miss)}</span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-2 border-t border-indigo-100/80 pt-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Do pobrania
                          </span>
                          <span className="text-lg font-black text-[#5a4fcf] leading-none tabular-nums">
                            {fmtQty(remainingToPick)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full max-w-[200px] px-5 py-3.5 bg-indigo-50 border border-indigo-100 rounded-2xl group-hover:border-indigo-200 transition-colors">
                        <span className="text-[10px] font-black text-[#5a4fcf] uppercase tracking-widest">
                          {total > 1 ? "Wielosztuki" : "Do pobrania"}
                        </span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-[#5a4fcf] leading-none tabular-nums">
                            {fmtQty(remainingToPick)}
                          </span>
                          <span className="text-[10px] font-bold text-[#5a4fcf]/80">szt.</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex flex-col justify-center items-end self-start sm:self-center w-full sm:w-[14rem] text-right">
                    {isShortageResolved ? (
                      <div className="flex items-center justify-end gap-1.5 px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-xs font-black text-red-800 uppercase tracking-wide">
                        <AlertTriangle size={14} strokeWidth={2.5} className="text-red-600" />
                        Brak produktu
                      </div>
                    ) : hasLocation ? (
                      <div className="flex flex-col items-end gap-1 w-full">
                        <div
                          className={`flex items-center justify-end gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-colors duration-300 ${
                            isCompletedPick
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700"
                              : "bg-indigo-50 border-indigo-100 text-[#5a4fcf]"
                          }`}
                          title={locCode}
                        >
                          {isCompletedPick ? <Check size={14} strokeWidth={3} /> : <MapPin size={14} strokeWidth={2.5} />}
                          {isCompletedPick
                            ? `Pobrano z ${formatWmsPickingLocationPillLabel(locCode, undefined)}`
                            : formatWmsPickingLocationPillLabel(locCode, pStock > 1e-9 ? pStock : undefined)}
                        </div>
                        {extra > 0 && !pickDone ? (
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {extraLocationsHint(extra)}
                          </span>
                        ) : null}
                      </div>
                    ) : isCompletedPick && pickedShown > 1e-9 ? (
                      <div className="flex items-center justify-end gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border bg-emerald-500/10 border-emerald-500/20 text-emerald-700">
                        <Check size={14} strokeWidth={3} />
                        Zebrano
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-black text-amber-700 uppercase tracking-wide">
                        <AlertTriangle size={14} strokeWidth={2.5} className="text-amber-500" />
                        Brak lokalizacji
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {allPicked && rows.length > 0 && (
          <section className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {finalizeErr ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900 text-center shadow-inner space-y-3">
                <p className="whitespace-pre-line">{finalizeErr}</p>
                {finalizeFailingPick?.product_id != null && pickingSession ? (
                  <button
                    type="button"
                    className="w-full rounded-xl border border-red-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-red-900 hover:bg-red-100"
                    onClick={() => {
                      navigate(WMS_ROUTES.pickingProduct(Number(finalizeFailingPick.product_id)), {
                        state: {
                          pickingSession,
                          navigationSource: "other",
                          highlightPickId: finalizeFailingPick.pick_id ?? null,
                        } satisfies WmsPickingProductsNavState,
                      });
                    }}
                  >
                    Przejdź do pobrania
                  </button>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              disabled={finalizeBusy || !canFinalizeSession}
              onClick={() => void onFinalizeCart()}
              className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[#5a4fcf] hover:bg-[#4a40b2] px-6 text-base font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-500/20 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {finalizeBusy ? "Zapisywanie…" : recoveryOrderId != null && recoveryOrderId > 0 ? "Zakończ dogrywkę" : "Zakończ zbieranie"}
            </button>
          </section>
        )}

      </WmsOperationalPageBody>

      {finalizeShortageModal ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wms-pick-finalize-shortage-title"
        >
          <div className="max-h-[min(92vh,720px)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 id="wms-pick-finalize-shortage-title" className="text-base font-semibold text-slate-900">
                Zamówienie zawiera braki
              </h2>
            </div>
            <div className="space-y-3 px-4 py-4 text-sm text-slate-800">
              <p className="font-medium text-slate-900">
                <span className="text-rose-800">{polishProductShortageModalSkuLine(finalizeShortageModal.products)}</span>
              </p>
              <p>
                <span className="font-semibold tabular-nums text-rose-800">{fmtQty(finalizeShortageModal.units)}</span>{" "}
                szt. łącznie
              </p>
              {finalizeShortageGroups.length > 0 ? (
                <div className="rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-rose-900">Produkty z brakami</p>
                  <ul className="mt-2 list-none space-y-3 p-0">
                    {finalizeShortageGroups.map((g) => (
                      <li key={g.lines[0]?.order_id ?? g.order_number}>
                        <p className="font-semibold text-slate-900">Zamówienie {g.order_number}</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-800">
                          {g.lines.map((ln) => (
                            <li key={`${ln.order_id}-${ln.product_id}`}>
                              {ln.product_name} — brak {fmtQty(ln.missing_quantity)} szt.
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-4">
              <button
                type="button"
                className="min-h-[48px] w-full rounded-xl bg-rose-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-rose-700"
                onClick={() => {
                  const ids = finalizeShortageModal?.orderIds ?? [];
                  const first = ids.length > 0 ? ids[0] : null;
                  setFinalizeShortageModal(null);
                  navigate(first != null ? WMS_ROUTES.braki(first) : WMS_ROUTES.braki());
                }}
              >
                Przejdź do braków
              </button>
              <button
                type="button"
                className="min-h-[48px] w-full rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-indigo-700"
                onClick={() => {
                  setFinalizeShortageModal(null);
                  showScannerToast("Zbieranie zakończone");
                  navigate(WMS_ROUTES.picking, { replace: true });
                }}
              >
                Zakończ zbieranie
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {rejectOpen ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/30 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="text-sm font-black text-slate-900">Powód odrzucenia</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Brak czasu", "Awaria stanowiska", "Nieprawidłowe przypisanie", "Brak produktów", "Inne"].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setRejectReason(reason)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  {reason}
                </button>
              ))}
            </div>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={4}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
              placeholder="Opisz powód odrzucenia zadania..."
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRejectOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600">
                Anuluj
              </button>
              <button type="button" onClick={() => void rejectPriorityTask()} disabled={!rejectReason.trim()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
                Potwierdź
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {exitModalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="text-base font-black text-slate-900">Opuścić zbieranie?</div>
            <p className="mt-2 text-sm text-slate-600">
              Kontynuuj — wróć do zbierania. Anuluj zbieranie — przywróć status zamówień i zwolnij wózek.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={cancelBusy}
                onClick={() => setExitModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Kontynuuj
              </button>
              <button
                type="button"
                disabled={
                  cancelBusy ||
                  warehouseId == null ||
                  (isCartlessMode
                    ? !(activePickingSessionId != null && activePickingSessionId > 0)
                    : !(mergedSession?.cartId || snapshot?.cartId))
                }
                onClick={() => {
                  void (async () => {
                    if (warehouseId == null) return;
                    setCancelBusy(true);
                    try {
                      if (isCartlessMode && activePickingSessionId != null) {
                        await postWmsPickingCancelCartlessSession(
                          DAMAGE_TENANT_ID,
                          warehouseId,
                          activePickingSessionId,
                        );
                      } else {
                        const cartId = mergedSession?.cartId ?? snapshot?.cartId;
                        if (cartId == null) return;
                        await postWmsPickingCancelSession(DAMAGE_TENANT_ID, warehouseId, cartId);
                      }
                      clearPickingCart();
                      setExitModalOpen(false);
                      navigate(WMS_ROUTES.picking, { replace: true });
                    } catch (e) {
                      showScannerToast(extractApiErrorMessage(e) || "Nie udało się anulować zbierania.");
                    } finally {
                      setCancelBusy(false);
                    }
                  })();
                }}
                className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {cancelBusy ? "Anulowanie…" : "Anuluj zbieranie"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </WmsOperationalPageShell>
  );
}