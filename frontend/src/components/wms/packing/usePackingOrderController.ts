import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { patchOrderSelectCarton } from "../../../api/ordersApi";
import { getWmsPackingSettings } from "../../../api/wmsPackingSettingsApi";
import {
  getWmsPackingOrderDetail,
  postWmsPackingLinePack,
  postWmsPackingOrderFinish,
  postWmsPackingOrderScan,
  postWmsPackingPackAll,
  wmsPackingApiErrorCode,
  wmsPackingApiErrorMessage,
  type WmsPackingOrderDetailApi,
  type WmsPackingPostPackStepApi,
  type WmsPackingScanOutApi,
} from "../../../api/wmsPackingApi";
import {
  DEFAULT_WMS_PACKING_INTERFACE_DISPLAY,
  type WmsPackingInterfaceDisplay,
} from "../../../types/wmsPackingSettings";
import { useWarehouse } from "../../../context/WarehouseContext";
import { useWmsScanner } from "../../../context/WmsScannerContext";
import { playScanBeep } from "../../../utils/playScanBeep";
import { normalizeScanEan } from "../../../utils/wmsScanNormalize";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import { tryPackingBundleScan } from "../../../services/bundleScannerIntegration";
import type { BundleScanOut } from "../../../api/bundlesLogisticsApi";
import { loadWmsPackingSession, type WmsPackingSessionState } from "../../../pages/wms/wmsPackingSession";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import {
  firstIncompleteOrderItemId,
  isPackingOrderLinesFullyPacked,
  isPackingPhysicallyComplete,
  isPackingSessionFinished,
  lineQuantityRequired,
  scanErrorMessage,
  sortLinesForPacking,
} from "./packingHelpers";

export type PackingScanBootstrapState = {
  packingScanBootstrap?: WmsPackingScanOutApi;
};

export function usePackingOrderController(
  orderId: number,
  finishWithoutCartonRef: MutableRefObject<boolean>,
) {
  const navigate = useNavigate();
  const location = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { showScannerToast, refocusScannerInput, appendScanToHistory } = useWmsScanner();

  const [session, setSession] = useState<WmsPackingSessionState | null>(() => loadWmsPackingSession());
  const [detail, setDetail] = useState<WmsPackingOrderDetailApi | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const scanBusyRef = useRef(false);
  const actionBusyRef = useRef(false);
  const finishBusyRef = useRef(false);
  /** Zapobiega podwójnemu POST …/finish (Strict Mode / podwójny mount ekranu finalizacji). */
  const finishPromiseRef = useRef<Promise<boolean> | null>(null);
  const bootstrapConsumedRef = useRef(false);
  const [flashItemId, setFlashItemId] = useState<number | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined);

  const [activeProductId, setActiveProductId] = useState<number | null>(null);
  const [packQty, setPackQty] = useState(0);
  const [linePackBusy, setLinePackBusy] = useState(false);
  const [selectCartonBusy, setSelectCartonBusy] = useState(false);
  /** True while POST …/finish runs — ukrywa AutoActionsView do czasu decyzji STAY vs nawigacja na listę. */
  const [postPackFinishBusy, setPostPackFinishBusy] = useState(false);
  /** Po domknięciu linii — czekamy na wybór kartonu zanim przejdziemy do finalizacji (POST …/finish). */
  const [awaitingPostPackCarton, setAwaitingPostPackCarton] = useState(false);
  /** Krok 3: pełnoekranowa finalizacja — dopiero tu uruchamiamy POST …/finish (automatyzacje). */
  const [awaitingFinalizationRun, setAwaitingFinalizationRun] = useState(false);
  /** Kolejno wybrane kartony (wielopak); API zamówienia nadal trzyma jedno ``selected_carton_id`` (ostatnie). */
  const [selectedPackagingIds, setSelectedPackagingIds] = useState<string[]>([]);
  const pendingFinishAfterCartonRef = useRef(false);
  const [postPackPipeline, setPostPackPipeline] = useState<WmsPackingPostPackStepApi[] | null>(null);

  const [packingInterfaceDisplay, setPackingInterfaceDisplay] = useState<WmsPackingInterfaceDisplay>(
    DEFAULT_WMS_PACKING_INTERFACE_DISPLAY,
  );
  const [bundlePackScan, setBundlePackScan] = useState<BundleScanOut | null>(null);

  const refreshSession = useCallback(() => {
    setSession(loadWmsPackingSession());
  }, []);

  const fetchDetail = useCallback(async () => {
    const s = loadWmsPackingSession();
    if (!s?.mode || warehouseId == null || !Number.isFinite(orderId) || orderId < 1) return;
    if ((s.mode === "bulk" || s.mode === "baskets") && (s.cartId == null || !Number.isFinite(s.cartId))) return;
    setLoadErr(null);
    try {
      const d = await getWmsPackingOrderDetail(
        DAMAGE_TENANT_ID,
        warehouseId,
        s.statusId,
        s.mode,
        orderId,
        s.mode === "no_cart" ? undefined : s.cartId,
      );
      setDetail(d);
    } catch (e) {
      const code = wmsPackingApiErrorCode(e);
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        setLoadErr(code === "ORDER_NOT_IN_QUEUE" ? "Zamówienie poza kolejką" : "Nie znaleziono zamówienia");
      } else {
        setLoadErr("Nie udało się wczytać zamówienia");
      }
      setDetail(null);
    }
  }, [warehouseId, orderId]);

  useEffect(() => {
    refreshSession();
    const s = loadWmsPackingSession();
    if (!s) {
      navigate(WMS_ROUTES.packing, { replace: true });
      return;
    }
    if (!s.mode) {
      navigate(WMS_ROUTES.packingMode, { replace: true });
      return;
    }
    if ((s.mode === "bulk" || s.mode === "baskets") && (s.cartId == null || !Number.isFinite(s.cartId))) {
      navigate(WMS_ROUTES.packingMode, { replace: true });
      return;
    }
    if (!Number.isFinite(orderId) || orderId < 1) {
      navigate(WMS_ROUTES.packingOrders, { replace: true });
      return;
    }

    const navState = location.state as PackingScanBootstrapState | null;
    const boot = navState?.packingScanBootstrap;
    if (boot && !bootstrapConsumedRef.current && boot.detail?.order_id === orderId) {
      // Detail ustawimy w efekcie bootstrap (po applyPackingResult) — unikamy wyścigu z GET detail.
      return;
    }

    void fetchDetail();
  }, [navigate, fetchDetail, refreshSession, orderId, location.state]);

  useEffect(() => {
    bootstrapConsumedRef.current = false;
    setPostPackFinishBusy(false);
    finishWithoutCartonRef.current = false;
    setAwaitingPostPackCarton(false);
    setAwaitingFinalizationRun(false);
    setSelectedPackagingIds([]);
    setBundlePackScan(null);
    setPostPackPipeline(null);
    pendingFinishAfterCartonRef.current = false;
  }, [orderId, finishWithoutCartonRef]);

  /** Przy otwarciu modala wyboru opakowań — zsynchronizuj listę z już zapisanym kartonem (np. z panelu). */
  useEffect(() => {
    if (!awaitingPostPackCarton || !detail) return;
    const sel = (detail.selected_carton_id ?? "").trim();
    setSelectedPackagingIds((prev) => {
      if (prev.length > 0) return prev;
      return sel ? [sel] : [];
    });
  }, [awaitingPostPackCarton, detail?.order_id, detail?.selected_carton_id]);

  /**
   * Wznów karton/finalizację gdy linie kompletne, a automatyzacje jeszcze nie.
   * Nie mylić packed_at z FINALIZED (automation_finished_at).
   */
  useEffect(() => {
    if (!detail) return;
    if (isPackingSessionFinished(detail)) return;
    if (detail.total_quantity > 0 && detail.packed_quantity < detail.total_quantity) return;
    if (!isPackingPhysicallyComplete(detail) && !isPackingOrderLinesFullyPacked(detail)) return;
    const phase = (detail.wms_workflow_phase ?? "").toUpperCase();
    if (phase === "NEEDS_DECISION") return;
    if (finishBusyRef.current) return;
    if (awaitingPostPackCarton || awaitingFinalizationRun) return;
    const sel = (detail.selected_carton_id ?? "").trim();
    const allowNoCarton = finishWithoutCartonRef.current;
    if (!sel && !allowNoCarton) {
      pendingFinishAfterCartonRef.current = true;
      setAwaitingPostPackCarton(true);
      return;
    }
    setAwaitingPostPackCarton(false);
    setAwaitingFinalizationRun(true);
  }, [detail, awaitingPostPackCarton, awaitingFinalizationRun, finishWithoutCartonRef]);

  useEffect(() => {
    if (warehouseId == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await getWmsPackingSettings(DAMAGE_TENANT_ID, warehouseId);
        if (cancelled) return;
        setPackingInterfaceDisplay({
          ...DEFAULT_WMS_PACKING_INTERFACE_DISPLAY,
          ...(s.interface_display ?? {}),
        });
      } catch {
        if (!cancelled) setPackingInterfaceDisplay(DEFAULT_WMS_PACKING_INTERFACE_DISPLAY);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

  const triggerFlash = useCallback((orderItemId: number) => {
    setFlashItemId(orderItemId);
    if (flashTimerRef.current !== undefined) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setFlashItemId(null);
      flashTimerRef.current = undefined;
    }, 750);
  }, []);

  const runPostPackFinish = useCallback(async (): Promise<boolean> => {
    if (finishPromiseRef.current) return finishPromiseRef.current;
    if (finishBusyRef.current || warehouseId == null || !Number.isFinite(orderId) || orderId < 1) return false;
    const s = loadWmsPackingSession();
    if (!s?.mode) return false;
    if ((s.mode === "bulk" || s.mode === "baskets") && (s.cartId == null || !Number.isFinite(s.cartId))) return false;

    const run = (async (): Promise<boolean> => {
      finishBusyRef.current = true;
      setPostPackFinishBusy(true);
      let navigatedAway = false;
      try {
        const out = await postWmsPackingOrderFinish(
          DAMAGE_TENANT_ID,
          warehouseId,
          s.statusId,
          s.mode,
          orderId,
          s.mode === "no_cart" ? undefined : s.cartId,
          { allow_without_carton: finishWithoutCartonRef.current },
        );
        finishWithoutCartonRef.current = false;
        if (out.packing_after_finish_action === "GO_TO_LIST") {
          const currentStatus = s.statusId;
          navigatedAway = true;
          navigate(`${WMS_ROUTES.packingOrders}?status=${encodeURIComponent(String(currentStatus))}`, {
            replace: true,
          });
          return true;
        }
        setDetail(out.detail);
        setAwaitingFinalizationRun(false);
        if (out.post_pack_pipeline != null) {
          setPostPackPipeline(out.post_pack_pipeline);
        }
        if (import.meta.env.DEV) {
          const docStep = out.post_pack_pipeline?.find((x) => x.step === "create_document" && x.ok && x.skipped !== true);
          if (docStep?.message) {
            const m = docStep.message;
            const idMatch = /^id=([^;]+)/.exec(m);
            if (idMatch) console.log("DOCUMENT CREATED", idMatch[1]);
          }
        }
        return true;
      } catch (e) {
        const code = wmsPackingApiErrorCode(e);
        const apiMsg = wmsPackingApiErrorMessage(e);
        showScannerToast(apiMsg || scanErrorMessage(code));
        if (import.meta.env.DEV) console.error("DOCUMENT CREATE FAILED / finish packing", e);
        return false;
      } finally {
        finishBusyRef.current = false;
        if (!navigatedAway) setPostPackFinishBusy(false);
      }
    })();

    finishPromiseRef.current = run;
    void run.finally(() => {
      if (finishPromiseRef.current === run) finishPromiseRef.current = null;
    });
    return run;
  }, [warehouseId, orderId, showScannerToast, navigate, finishWithoutCartonRef]);

  const advanceActiveAfterPack = useCallback((d: WmsPackingOrderDetailApi, lastPackedOrderItemId: number | null) => {
    if (lastPackedOrderItemId == null) {
      setActiveProductId(firstIncompleteOrderItemId(d.lines));
      return;
    }
    const ln = d.lines.find((l) => l.order_item_id === lastPackedOrderItemId);
    if (ln != null && ln.quantity_packed >= lineQuantityRequired(ln)) {
      setActiveProductId(firstIncompleteOrderItemId(d.lines));
    } else {
      setActiveProductId(lastPackedOrderItemId);
    }
  }, []);

  const applyPackingResult = useCallback(
    (out: WmsPackingScanOutApi) => {
      setDetail(out.detail);
      if (out.post_pack_pipeline != null) {
        setPostPackPipeline(out.post_pack_pipeline);
      }
      if (out.fully_packed) {
        if (out.last_packed_order_item_id != null) {
          triggerFlash(out.last_packed_order_item_id);
        }
        setActiveProductId(null);
        const sel = (out.detail.selected_carton_id ?? "").trim();
        const allowNoCarton = finishWithoutCartonRef.current;
        if (!sel && !allowNoCarton) {
          pendingFinishAfterCartonRef.current = true;
          setAwaitingPostPackCarton(true);
          return;
        }
        setAwaitingPostPackCarton(false);
        setAwaitingFinalizationRun(true);
        return;
      }
      advanceActiveAfterPack(out.detail, out.last_packed_order_item_id ?? null);
      if (out.last_packed_order_item_id != null) {
        triggerFlash(out.last_packed_order_item_id);
      }
    },
    [triggerFlash, advanceActiveAfterPack, finishWithoutCartonRef],
  );

  /** Pierwszy skan z listy: wynik POST resolve-ean/scan — dokładnie raz, bez replay. */
  useEffect(() => {
    const navState = location.state as PackingScanBootstrapState | null;
    const boot = navState?.packingScanBootstrap;
    if (!boot || bootstrapConsumedRef.current) return;
    if (boot.detail?.order_id !== orderId) return;
    bootstrapConsumedRef.current = true;
    navigate(location.pathname, { replace: true, state: {} });
    setLoadErr(null);
    applyPackingResult(boot);
  }, [location.state, location.pathname, orderId, navigate, applyPackingResult]);

  useEffect(() => {
    if (activeProductId == null || detail == null) return;
    const line = detail.lines.find((l) => l.order_item_id === activeProductId);
    if (line == null || line.quantity_packed >= lineQuantityRequired(line)) {
      setActiveProductId(null);
      return;
    }
    const maxRem = lineQuantityRequired(line) - line.quantity_packed;
    setPackQty((q) => Math.min(Math.max(0, q), maxRem));
  }, [detail, activeProductId]);

  const sortedLines = useMemo(
    () => (detail?.lines ? sortLinesForPacking(detail.lines, flashItemId) : []),
    [detail?.lines, flashItemId],
  );

  const onScan = useCallback(
    async (raw: string) => {
      const ean = normalizeScanEan(raw);
      if (!ean || warehouseId == null || scanBusyRef.current) return;
      const s = loadWmsPackingSession();
      if (!s?.mode || !Number.isFinite(orderId) || orderId < 1) return;
      if ((s.mode === "bulk" || s.mode === "baskets") && (s.cartId == null || !Number.isFinite(s.cartId))) return;

      scanBusyRef.current = true;
      setScanBusy(true);
      try {
        const bundle = await tryPackingBundleScan(DAMAGE_TENANT_ID, orderId, ean);
        if (bundle.handled && bundle.scan) {
          setBundlePackScan(bundle.scan);
          playScanBeep();
          appendScanToHistory(ean);
          if (bundle.packLine) {
            const out = await postWmsPackingLinePack(
              DAMAGE_TENANT_ID,
              warehouseId,
              s.statusId,
              s.mode,
              orderId,
              bundle.packLine.orderItemId,
              bundle.packLine.qty,
              s.mode === "no_cart" ? undefined : s.cartId,
            );
            applyPackingResult(out);
          }
          if (bundle.toast) showScannerToast(bundle.toast);
          if (bundle.packLine) return;
        }

        const out = await postWmsPackingOrderScan(
          DAMAGE_TENANT_ID,
          warehouseId,
          s.statusId,
          s.mode,
          orderId,
          ean,
          s.mode === "no_cart" ? undefined : s.cartId,
        );
        playScanBeep();
        appendScanToHistory(ean);
        applyPackingResult(out);
      } catch (e) {
        const code = wmsPackingApiErrorCode(e);
        showScannerToast(scanErrorMessage(code));
      } finally {
        scanBusyRef.current = false;
        setScanBusy(false);
        refocusScannerInput();
      }
    },
    [warehouseId, orderId, appendScanToHistory, showScannerToast, refocusScannerInput, applyPackingResult],
  );

  const confirmPack = useCallback(async (orderItemId?: number, qtyOverride?: number) => {
    const targetId = orderItemId ?? activeProductId;
    if (targetId == null || detail == null || warehouseId == null || actionBusyRef.current || linePackBusy) return;
    const line = detail.lines.find((l) => l.order_item_id === targetId);
    if (line == null || line.quantity_packed >= lineQuantityRequired(line)) return;
    const s = loadWmsPackingSession();
    if (!s?.mode) return;
    const rem = lineQuantityRequired(line) - line.quantity_packed;
    if (rem <= 0) return;
    const baseQty = qtyOverride !== undefined ? qtyOverride : packQty;
    const q = Math.min(Math.max(0, baseQty), rem);
    if (q <= 0) return;
    actionBusyRef.current = true;
    setLinePackBusy(true);
    try {
      const out = await postWmsPackingLinePack(
        DAMAGE_TENANT_ID,
        warehouseId,
        s.statusId,
        s.mode,
        orderId,
        line.order_item_id,
        q,
        s.mode === "no_cart" ? undefined : s.cartId,
      );
      playScanBeep();
      applyPackingResult(out);
    } catch (e) {
      const code = wmsPackingApiErrorCode(e);
      showScannerToast(scanErrorMessage(code));
    } finally {
      actionBusyRef.current = false;
      setLinePackBusy(false);
      refocusScannerInput();
    }
  }, [
    activeProductId,
    detail,
    warehouseId,
    orderId,
    packQty,
    applyPackingResult,
    showScannerToast,
    refocusScannerInput,
    linePackBusy,
  ]);

  const packAll = useCallback(async () => {
    if (warehouseId == null || actionBusyRef.current || !detail) return;
    if (detail.packed_quantity >= detail.total_quantity) return;
    const s = loadWmsPackingSession();
    if (!s?.mode) return;
    actionBusyRef.current = true;
    setScanBusy(true);
    try {
      const out = await postWmsPackingPackAll(
        DAMAGE_TENANT_ID,
        warehouseId,
        s.statusId,
        s.mode,
        orderId,
        s.mode === "no_cart" ? undefined : s.cartId,
      );
      playScanBeep();
      applyPackingResult(out);
    } catch (e) {
      const code = wmsPackingApiErrorCode(e);
      showScannerToast(scanErrorMessage(code));
    } finally {
      actionBusyRef.current = false;
      setScanBusy(false);
      refocusScannerInput();
    }
  }, [warehouseId, detail, orderId, applyPackingResult, showScannerToast, refocusScannerInput]);

  const activateProduct = useCallback((orderItemId: number) => {
    setActiveProductId(orderItemId);
    setPackQty(0);
  }, []);

  const onPackQtyChange = useCallback((_orderItemId: number, qty: number) => {
    setPackQty(qty);
  }, []);

  const selectCarton = useCallback(
    async (cartonId: string) => {
      if (warehouseId == null || !Number.isFinite(orderId) || orderId < 1) return;
      const cid = cartonId.trim();
      if (!cid) return;
      setSelectCartonBusy(true);
      try {
        const res = await patchOrderSelectCarton(orderId, DAMAGE_TENANT_ID, { carton_id: cid });
        setDetail((d) =>
          d
            ? {
                ...d,
                selected_carton_id: res.selected_carton_id,
                selected_carton: res.selected_carton ?? null,
              }
            : null,
        );
        setSelectedPackagingIds((prev) => (prev.includes(cid) ? prev : [...prev, cid]));
      } catch {
        showScannerToast("Nie udało się zapisać wyboru kartonu.");
      } finally {
        setSelectCartonBusy(false);
      }
    },
    [warehouseId, orderId, showScannerToast],
  );

  const proceedToFinalization = useCallback(() => {
    const hasCarton =
      selectedPackagingIds.length > 0 || (detail?.selected_carton_id ?? "").trim() !== "";
    if (!finishWithoutCartonRef.current && !hasCarton) {
      showScannerToast("Wybierz co najmniej jedno opakowanie.");
      return;
    }
    pendingFinishAfterCartonRef.current = false;
    setAwaitingPostPackCarton(false);
    setAwaitingFinalizationRun(true);
  }, [detail, selectedPackagingIds.length, showScannerToast, finishWithoutCartonRef]);

  const continueWithoutCartonToFinalization = useCallback(() => {
    if (!pendingFinishAfterCartonRef.current) return;
    finishWithoutCartonRef.current = true;
    pendingFinishAfterCartonRef.current = false;
    setAwaitingPostPackCarton(false);
    setAwaitingFinalizationRun(true);
  }, [finishWithoutCartonRef]);

  return {
    session,
    warehouseId,
    detail,
    loadErr,
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
    fetchDetail,
    navigate,
    refocusScannerInput,
    selectCarton,
    selectCartonBusy,
    postPackFinishBusy,
    packingInterfaceDisplay,
    awaitingPostPackCarton,
    awaitingFinalizationRun,
    selectedPackagingIds,
    proceedToFinalization,
    continueWithoutCartonToFinalization,
    runPostPackFinish,
    bundlePackScan,
    postPackPipeline,
  };
}
