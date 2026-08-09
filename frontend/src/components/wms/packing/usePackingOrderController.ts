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
  createAndPrintReplacementLabel,
  findReplacementOfferStep,
  handleReplacementLabelScan,
  isReplacementLabelBarcode,
} from "./packingReplacementLabelActions";
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
  DEFAULT_WMS_PACKING_EXTENDED_UI,
  loadWmsPackingExtendedUi,
  type WmsPackingExtendedUiSettings,
} from "../../../types/wmsPackingExtendedUi";
import { buildPackingProductFieldVisibility } from "./packingProductDisplay";
import {
  runPackingPostFinishClientActions,
  type WaybillPrintChoice,
} from "./packingPostFinishClientActions";
import {
  decideListScanBootstrapUi,
  firstIncompleteOrderItemId,
  isPackingOrderLinesFullyPacked,
  isPackingPhysicallyComplete,
  isPackingSessionFinished,
  lineQuantityRequired,
  scanErrorMessage,
  sortLinesForPacking,
} from "./packingHelpers";
import {
  decideAfterNotesPopupDismiss,
  decideFullyPackedNotesGate,
  filterPackingOperationalNotes,
  isSingleUnitPackingOrder,
  shouldOpenPackingNotesPopup,
  type NotesPopupPendingAction,
} from "./packingNotes";

export type PackingFinishRunResult = "ok" | "cancelled" | "error";

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
  const finishPromiseRef = useRef<Promise<PackingFinishRunResult> | null>(null);
  const bootstrapConsumedRef = useRef(false);
  /** Po skanie z listy: nie otwieraj kartonu automatycznie — najpierw widok zamówienia. */
  const deferCartonFromListBootstrapRef = useRef(false);
  const [showProceedAfterLinesCompleteCta, setShowProceedAfterLinesCompleteCta] = useState(false);
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
  const [shipmentConfirmOpen, setShipmentConfirmOpen] = useState(false);
  const shipmentConfirmResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const [waybillChoiceOpen, setWaybillChoiceOpen] = useState(false);
  const [waybillChoiceCount, setWaybillChoiceCount] = useState(1);
  const waybillChoiceResolverRef = useRef<((c: WaybillPrintChoice) => void) | null>(null);
  const [replacementModalOpen, setReplacementModalOpen] = useState(false);
  const [replacementModalError, setReplacementModalError] = useState("");
  const [replacementModalDelay, setReplacementModalDelay] = useState(0);
  const [replacementModalBusy, setReplacementModalBusy] = useState(false);
  const replacementModalResolverRef = useRef<((generate: boolean) => void) | null>(null);

  const [packingInterfaceDisplay, setPackingInterfaceDisplay] = useState<WmsPackingInterfaceDisplay>(
    DEFAULT_WMS_PACKING_INTERFACE_DISPLAY,
  );
  const [packingExtendedUi, setPackingExtendedUi] = useState<WmsPackingExtendedUiSettings>(() => ({
    ...DEFAULT_WMS_PACKING_EXTENDED_UI,
  }));
  const [notesPopupOpen, setNotesPopupOpen] = useState(false);
  const [notesAcknowledged, setNotesAcknowledged] = useState(false);
  const notesPendingActionRef = useRef<NotesPopupPendingAction>("none");
  /** Popup przerwał ścieżkę fully_packed — po zamknięciu (1×1) wymagany kolejny skan/pack. */
  const notesInterruptedFullyPackedRef = useRef(false);
  /** Po zamknięciu popupu na 1×1: kolejny skan/pack ma wejść w karton/finalizację (bez drugiego popupu). */
  const resumeAutoAfterNotesRescanRef = useRef(false);
  const [bundlePackScan, setBundlePackScan] = useState<BundleScanOut | null>(null);

  useEffect(() => {
    if (warehouseId == null) {
      setPackingExtendedUi({ ...DEFAULT_WMS_PACKING_EXTENDED_UI });
      return;
    }
    setPackingExtendedUi(loadWmsPackingExtendedUi(warehouseId));
  }, [warehouseId]);

  useEffect(() => {
    setNotesPopupOpen(false);
    setNotesAcknowledged(false);
    notesPendingActionRef.current = "none";
    notesInterruptedFullyPackedRef.current = false;
    resumeAutoAfterNotesRescanRef.current = false;
  }, [orderId]);

  const refreshSession = useCallback(() => {
    setSession(loadWmsPackingSession());
  }, []);

  const fetchDetail = useCallback(async () => {
    const s = loadWmsPackingSession();
    if (!s?.mode || warehouseId == null || !Number.isFinite(orderId) || orderId < 1) return;
    if ((s.mode === "bulk" && (s.cartId == null || !Number.isFinite(s.cartId)))) return;
    setLoadErr(null);
    try {
      const d = await getWmsPackingOrderDetail(
        DAMAGE_TENANT_ID,
        warehouseId,
        s.statusId,
        s.mode,
        orderId,
        s.mode === "bulk" || s.mode === "baskets" ? s.cartId : undefined,
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
    if ((s.mode === "bulk" && (s.cartId == null || !Number.isFinite(s.cartId)))) {
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
    deferCartonFromListBootstrapRef.current = false;
    setShowProceedAfterLinesCompleteCta(false);
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
   * Po bootstrapie ze skanu listy — nie otwieraj od razu (deferCartonFromListBootstrapRef).
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
    if (deferCartonFromListBootstrapRef.current) return;
    const multiParcel = packingExtendedUi.enableMultiParcel;
    const sel = (detail.selected_carton_id ?? "").trim();
    const allowNoCarton = finishWithoutCartonRef.current;
    // Wielopaczkowość ON → zawsze okno paczek przed akcjami automatycznymi.
    if (multiParcel || (!sel && !allowNoCarton)) {
      pendingFinishAfterCartonRef.current = true;
      setAwaitingPostPackCarton(true);
      return;
    }
    setAwaitingPostPackCarton(false);
    setAwaitingFinalizationRun(true);
  }, [
    detail,
    awaitingPostPackCarton,
    awaitingFinalizationRun,
    finishWithoutCartonRef,
    packingExtendedUi.enableMultiParcel,
  ]);

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

  const askShipmentConfirm = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      shipmentConfirmResolverRef.current = resolve;
      setShipmentConfirmOpen(true);
    });
  }, []);

  const resolveShipmentConfirm = useCallback((ok: boolean) => {
    setShipmentConfirmOpen(false);
    const r = shipmentConfirmResolverRef.current;
    shipmentConfirmResolverRef.current = null;
    r?.(ok);
  }, []);

  const askWaybillPrintChoice = useCallback((count: number): Promise<WaybillPrintChoice> => {
    return new Promise((resolve) => {
      setWaybillChoiceCount(count);
      waybillChoiceResolverRef.current = resolve;
      setWaybillChoiceOpen(true);
    });
  }, []);

  const resolveWaybillPrintChoice = useCallback((choice: WaybillPrintChoice) => {
    setWaybillChoiceOpen(false);
    const r = waybillChoiceResolverRef.current;
    waybillChoiceResolverRef.current = null;
    r?.(choice);
  }, []);

  const askReplacementLabelOffer = useCallback(
    (errorMessage: string, delaySeconds: number): Promise<boolean> => {
      return new Promise((resolve) => {
        replacementModalResolverRef.current = resolve;
        setReplacementModalError(errorMessage);
        setReplacementModalDelay(delaySeconds);
        setReplacementModalBusy(false);
        setReplacementModalOpen(true);
      });
    },
    [],
  );

  const confirmReplacementLabelGenerate = useCallback(() => {
    // Keep modal open — parent sets busy and closes after create/print.
    const r = replacementModalResolverRef.current;
    replacementModalResolverRef.current = null;
    r?.(true);
  }, []);

  const cancelReplacementLabelModal = useCallback(() => {
    if (replacementModalBusy) return;
    setReplacementModalOpen(false);
    setReplacementModalBusy(false);
    const r = replacementModalResolverRef.current;
    replacementModalResolverRef.current = null;
    r?.(false);
  }, [replacementModalBusy]);

  const runPostPackFinish = useCallback(async (): Promise<PackingFinishRunResult> => {
    if (finishPromiseRef.current) return finishPromiseRef.current;
    if (finishBusyRef.current || warehouseId == null || !Number.isFinite(orderId) || orderId < 1) {
      return "error";
    }
    const s = loadWmsPackingSession();
    if (!s?.mode) return "error";
    if ((s.mode === "bulk" && (s.cartId == null || !Number.isFinite(s.cartId)))) return "error";

    const run = (async (): Promise<PackingFinishRunResult> => {
      finishBusyRef.current = true;
      setPostPackFinishBusy(true);
      let navigatedAway = false;
      try {
        const [apiSettings, ext] = await Promise.all([
          getWmsPackingSettings(DAMAGE_TENANT_ID, warehouseId).catch(() => null),
          Promise.resolve(loadWmsPackingExtendedUi(warehouseId)),
        ]);

        if (ext.requireConfirmBeforeShipment && apiSettings?.auto_actions.generate_shipment) {
          const confirmed = await askShipmentConfirm();
          if (!confirmed) {
            return "cancelled";
          }
        }

        const packagingIds =
          selectedPackagingIds.length > 0
            ? selectedPackagingIds
            : (detail?.selected_carton_id ?? "").trim()
              ? [(detail!.selected_carton_id as string).trim()]
              : [];

        const out = await postWmsPackingOrderFinish(
          DAMAGE_TENANT_ID,
          warehouseId,
          s.statusId,
          s.mode,
          orderId,
          s.mode === "bulk" || s.mode === "baskets" ? s.cartId : undefined,
          {
            allow_without_carton: finishWithoutCartonRef.current,
            orderType: s.orderTypeFilter ?? "all",
            packaging_carton_ids: packagingIds,
          },
        );
        finishWithoutCartonRef.current = false;

        try {
          await runPackingPostFinishClientActions({
            tenantId: DAMAGE_TENANT_ID,
            warehouseId,
            pipeline: out.post_pack_pipeline,
            afterSalesDocumentAction: ext.afterSalesDocumentAction,
            afterWaybillAction: ext.afterWaybillAction,
            printDocumentEnabled: Boolean(apiSettings?.auto_actions.print_document),
            printLabelEnabled: Boolean(apiSettings?.auto_actions.print_label),
            printCopyOfSalesDoc: Boolean(ext.printCopyOfSalesDoc),
            chooseWaybillPrintCount: Boolean(ext.chooseWaybillPrintCount),
            requestWaybillPrintChoice: askWaybillPrintChoice,
          });
        } catch {
          /* soft-fail */
        }

        const offerStep = findReplacementOfferStep(out.post_pack_pipeline);
        if (offerStep) {
          const delaySeconds = Number(apiSettings?.fallback_label?.delay_seconds) || 0;
          const wantGenerate = await askReplacementLabelOffer(
            offerStep.message || "Nie udało się wygenerować etykiety kurierskiej.",
            delaySeconds,
          );
          if (wantGenerate) {
            setReplacementModalBusy(true);
            try {
              await createAndPrintReplacementLabel({
                tenantId: DAMAGE_TENANT_ID,
                warehouseId,
                orderId,
                courierError: offerStep.message,
              });
              showScannerToast("Wygenerowano etykietę zastępczą.");
            } catch (e) {
              const code = wmsPackingApiErrorCode(e);
              const apiMsg = wmsPackingApiErrorMessage(e);
              if (code === "replacement_template_not_configured") {
                showScannerToast(
                  apiMsg || "Nie skonfigurowano szablonu etykiety zastępczej w ustawieniach WMS.",
                );
              } else {
                showScannerToast(apiMsg || "Nie udało się wygenerować etykiety zastępczej.");
              }
            } finally {
              setReplacementModalOpen(false);
              setReplacementModalBusy(false);
            }
          } else {
            setReplacementModalOpen(false);
          }
        }

        if (out.packing_after_finish_action === "GO_TO_LIST") {
          const currentStatus = s.statusId;
          navigatedAway = true;
          navigate(`${WMS_ROUTES.packingOrders}?status=${encodeURIComponent(String(currentStatus))}`, {
            replace: true,
          });
          return "ok";
        }
        if (out.packing_after_finish_action === "NEXT_ORDER") {
          const nextId = out.next_order_id;
          navigatedAway = true;
          if (nextId != null && Number.isFinite(nextId) && nextId > 0) {
            navigate(WMS_ROUTES.packingOrder(nextId), { replace: true });
          } else {
            navigate(`${WMS_ROUTES.packingOrders}?status=${encodeURIComponent(String(s.statusId))}`, {
              replace: true,
            });
          }
          return "ok";
        }
        setDetail(out.detail);
        setAwaitingFinalizationRun(false);
        if (out.post_pack_pipeline != null) {
          setPostPackPipeline(out.post_pack_pipeline);
        }
        return "ok";
      } catch (e) {
        const code = wmsPackingApiErrorCode(e);
        const apiMsg = wmsPackingApiErrorMessage(e);
        showScannerToast(apiMsg || scanErrorMessage(code));
        if (import.meta.env.DEV) console.error("DOCUMENT CREATE FAILED / finish packing", e);
        return "error";
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
  }, [
    warehouseId,
    orderId,
    showScannerToast,
    navigate,
    finishWithoutCartonRef,
    askShipmentConfirm,
    askWaybillPrintChoice,
    askReplacementLabelOffer,
    selectedPackagingIds,
    detail,
  ]);

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

  const beginPostPackAdvance = useCallback(
    (d: WmsPackingOrderDetailApi) => {
      deferCartonFromListBootstrapRef.current = false;
      setShowProceedAfterLinesCompleteCta(false);
      const multiParcel = packingExtendedUi.enableMultiParcel;
      const sel = (d.selected_carton_id ?? "").trim();
      const allowNoCarton = finishWithoutCartonRef.current;
      if (multiParcel || (!sel && !allowNoCarton)) {
        pendingFinishAfterCartonRef.current = true;
        setAwaitingPostPackCarton(true);
        return;
      }
      setAwaitingPostPackCarton(false);
      setAwaitingFinalizationRun(true);
    },
    [finishWithoutCartonRef, packingExtendedUi.enableMultiParcel],
  );

  const visiblePackingNotes = useMemo(() => {
    if (!detail) return [];
    return filterPackingOperationalNotes(
      detail.operational_notes_packing,
      packingExtendedUi.showAllNotes,
    );
  }, [detail, packingExtendedUi.showAllNotes]);

  /** Wejście w zamówienie z notatkami — popup zanim operator kontynuuje. */
  useEffect(() => {
    if (!detail || notesAcknowledged || notesPopupOpen) return;
    if (
      !shouldOpenPackingNotesPopup({
        requireNotesPopup: packingExtendedUi.requireNotesPopup,
        visibleNotes: visiblePackingNotes,
        alreadyAcknowledged: notesAcknowledged,
      })
    ) {
      return;
    }
    setNotesPopupOpen(true);
  }, [
    detail,
    notesAcknowledged,
    notesPopupOpen,
    packingExtendedUi.requireNotesPopup,
    visiblePackingNotes,
  ]);

  const acknowledgeNotesPopup = useCallback(() => {
    const pending = notesPendingActionRef.current;
    const interruptedFullyPacked = notesInterruptedFullyPackedRef.current;
    notesPendingActionRef.current = "none";
    notesInterruptedFullyPackedRef.current = false;
    setNotesPopupOpen(false);
    setNotesAcknowledged(true);

    const single = detail ? isSingleUnitPackingOrder(detail) : false;
    const decision = decideAfterNotesPopupDismiss({
      isSingleUnit: single,
      pendingAction: pending,
    });

    if (single && interruptedFullyPacked) {
      // Nie uruchamiaj automatyki — wymagany kolejny skan/pack.
      resumeAutoAfterNotesRescanRef.current = true;
      setShowProceedAfterLinesCompleteCta(false);
      return;
    }

    if (decision.showProceedCta) {
      deferCartonFromListBootstrapRef.current = true;
      setShowProceedAfterLinesCompleteCta(true);
      return;
    }
    if (decision.advanceToCartonOrFinish && detail) {
      beginPostPackAdvance(detail);
    }
  }, [detail, beginPostPackAdvance]);

  const applyPackingResult = useCallback(
    (out: WmsPackingScanOutApi, opts?: { fromListBootstrap?: boolean }) => {
      setDetail(out.detail);
      if (out.post_pack_pipeline != null) {
        setPostPackPipeline(out.post_pack_pipeline);
      }
      if (out.fully_packed) {
        if (out.last_packed_order_item_id != null) {
          triggerFlash(out.last_packed_order_item_id);
        }
        setActiveProductId(null);

        const visibleNotes = filterPackingOperationalNotes(
          out.detail.operational_notes_packing,
          packingExtendedUi.showAllNotes,
        );
        const single = isSingleUnitPackingOrder(out.detail);
        const gate = decideFullyPackedNotesGate({
          requireNotesPopup: packingExtendedUi.requireNotesPopup,
          visibleNotesCount: visibleNotes.length,
          alreadyAcknowledged: notesAcknowledged,
          fromListBootstrap: Boolean(opts?.fromListBootstrap),
          isSingleUnit: single,
        });

        if (gate.openNotesPopup) {
          notesPendingActionRef.current = gate.pendingAction;
          notesInterruptedFullyPackedRef.current = true;
          setNotesPopupOpen(true);
          return;
        }

        // Po zamknięciu popupu na 1×1: ten pack/skan wznawia auto-ścieżkę.
        if (resumeAutoAfterNotesRescanRef.current && notesAcknowledged) {
          resumeAutoAfterNotesRescanRef.current = false;
          beginPostPackAdvance(out.detail);
          return;
        }

        if (opts?.fromListBootstrap) {
          const decision = decideListScanBootstrapUi({ fullyPacked: true });
          deferCartonFromListBootstrapRef.current = decision.showProceedAfterLinesCompleteCta;
          setShowProceedAfterLinesCompleteCta(decision.showProceedAfterLinesCompleteCta);
          return;
        }

        beginPostPackAdvance(out.detail);
        return;
      }
      deferCartonFromListBootstrapRef.current = false;
      setShowProceedAfterLinesCompleteCta(false);
      advanceActiveAfterPack(out.detail, out.last_packed_order_item_id ?? null);
      if (out.last_packed_order_item_id != null) {
        triggerFlash(out.last_packed_order_item_id);
      }
    },
    [
      triggerFlash,
      advanceActiveAfterPack,
      packingExtendedUi.requireNotesPopup,
      packingExtendedUi.showAllNotes,
      notesAcknowledged,
      beginPostPackAdvance,
    ],
  );

  /** Pierwszy skan z listy: wynik POST resolve-ean/scan — dokładnie raz, bez replay; bez auto-kartonu. */
  useEffect(() => {
    const navState = location.state as PackingScanBootstrapState | null;
    const boot = navState?.packingScanBootstrap;
    if (!boot || bootstrapConsumedRef.current) return;
    if (boot.detail?.order_id !== orderId) return;
    bootstrapConsumedRef.current = true;
    navigate(location.pathname, { replace: true, state: {} });
    setLoadErr(null);
    applyPackingResult(boot, { fromListBootstrap: true });
  }, [location.state, location.pathname, orderId, navigate, applyPackingResult]);

  const proceedAfterLinesComplete = useCallback(() => {
    if (!detail) return;
    beginPostPackAdvance(detail);
  }, [detail, beginPostPackAdvance]);

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

  const tryResumeAutoAfterNotesRescan = useCallback((): boolean => {
    if (!detail) return false;
    if (!resumeAutoAfterNotesRescanRef.current || !notesAcknowledged) return false;
    if (!isPackingOrderLinesFullyPacked(detail)) return false;
    resumeAutoAfterNotesRescanRef.current = false;
    beginPostPackAdvance(detail);
    return true;
  }, [detail, notesAcknowledged, beginPostPackAdvance]);

  const onScan = useCallback(
    async (raw: string) => {
      const ean = normalizeScanEan(raw);
      if (!ean || warehouseId == null || scanBusyRef.current) return;
      if (notesPopupOpen) return;
      const s = loadWmsPackingSession();
      if (!s?.mode || !Number.isFinite(orderId) || orderId < 1) return;
      if ((s.mode === "bulk" && (s.cartId == null || !Number.isFinite(s.cartId)))) return;

      scanBusyRef.current = true;
      setScanBusy(true);
      try {
        if (isReplacementLabelBarcode(ean)) {
          playScanBeep();
          appendScanToHistory(ean);
          const result = await handleReplacementLabelScan({
            tenantId: DAMAGE_TENANT_ID,
            warehouseId,
            barcode: ean,
          });
          if (result.ok) {
            if (result.retry.message === "courier_already_generated") {
              showScannerToast("Etykieta kurierska dla tej etykiety zastępczej jest już wygenerowana.");
            } else {
              showScannerToast("Wygenerowano właściwą etykietę kurierską z zapisanych parametrów pakowania.");
            }
            if (result.orderId !== orderId) {
              navigate(WMS_ROUTES.packingOrder(result.orderId), { replace: true });
            } else {
              await fetchDetail();
            }
            return;
          }
          showScannerToast(result.message);
          if (result.orderId != null && result.orderId !== orderId) {
            navigate(WMS_ROUTES.packingOrder(result.orderId), { replace: true });
          }
          return;
        }

        if (tryResumeAutoAfterNotesRescan()) {
          playScanBeep();
          appendScanToHistory(ean);
          return;
        }

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
              s.mode === "bulk" || s.mode === "baskets" ? s.cartId : undefined,
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
          s.mode === "bulk" || s.mode === "baskets" ? s.cartId : undefined,
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
    [
      warehouseId,
      orderId,
      appendScanToHistory,
      showScannerToast,
      refocusScannerInput,
      applyPackingResult,
      notesPopupOpen,
      tryResumeAutoAfterNotesRescan,
      navigate,
      fetchDetail,
    ],
  );

  const confirmPack = useCallback(async (orderItemId?: number, qtyOverride?: number) => {
    if (notesPopupOpen) return;
    if (tryResumeAutoAfterNotesRescan()) {
      playScanBeep();
      return;
    }
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
        s.mode === "bulk" || s.mode === "baskets" ? s.cartId : undefined,
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
    notesPopupOpen,
    tryResumeAutoAfterNotesRescan,
  ]);

  const packAll = useCallback(async () => {
    if (notesPopupOpen) return;
    if (tryResumeAutoAfterNotesRescan()) {
      playScanBeep();
      return;
    }
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
        s.mode === "bulk" || s.mode === "baskets" ? s.cartId : undefined,
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
  }, [
    warehouseId,
    detail,
    orderId,
    applyPackingResult,
    showScannerToast,
    refocusScannerInput,
    notesPopupOpen,
    tryResumeAutoAfterNotesRescan,
  ]);

  const activateProduct = useCallback((orderItemId: number) => {
    setActiveProductId(orderItemId);
    setPackQty(0);
  }, []);

  const onPackQtyChange = useCallback((_orderItemId: number, qty: number) => {
    setPackQty(qty);
  }, []);

  const selectCarton = useCallback(
    async (cartonId: string, opts?: { confirmOverride?: boolean }) => {
      if (warehouseId == null || !Number.isFinite(orderId) || orderId < 1) return;
      const s = session;
      if (!s?.mode) return;
      const cid = cartonId.trim();
      if (!cid) return;
      setSelectCartonBusy(true);
      try {
        const res = await patchOrderSelectCarton(
          orderId,
          DAMAGE_TENANT_ID,
          { carton_id: cid, confirm_override: Boolean(opts?.confirmOverride) },
          {
            warehouseId,
            statusId: s.statusId,
            mode: s.mode,
            cartId: s.mode === "bulk" || s.mode === "baskets" ? s.cartId : undefined,
          },
        );
        if (res.requires_override_confirmation) {
          showScannerToast(res.physical_fit_warning || "Opakowanie może być za małe — potwierdź override.");
          return res;
        }
        setDetail((d) =>
          d
            ? {
                ...d,
                selected_carton_id: res.selected_carton_id,
                selected_carton: res.selected_carton ?? null,
              }
            : null,
        );
        setSelectedPackagingIds((prev) => {
          if (!packingExtendedUi.enableMultiParcel) return [cid];
          return prev.includes(cid) ? prev : [...prev, cid];
        });
        return res;
      } catch {
        showScannerToast("Nie udało się zapisać wyboru kartonu.");
      } finally {
        setSelectCartonBusy(false);
      }
    },
    [warehouseId, orderId, session, showScannerToast, packingExtendedUi.enableMultiParcel],
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

  const packingProductFieldVisibility = useMemo(
    () => buildPackingProductFieldVisibility(packingInterfaceDisplay, packingExtendedUi),
    [packingInterfaceDisplay, packingExtendedUi],
  );

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
    packingProductFieldVisibility,
    awaitingPostPackCarton,
    awaitingFinalizationRun,
    selectedPackagingIds,
    proceedToFinalization,
    continueWithoutCartonToFinalization,
    proceedAfterLinesComplete,
    showProceedAfterLinesCompleteCta,
    runPostPackFinish,
    bundlePackScan,
    postPackPipeline,
    packingExtendedUi,
    visiblePackingNotes,
    notesPopupOpen,
    acknowledgeNotesPopup,
    shipmentConfirmOpen,
    resolveShipmentConfirm,
    waybillChoiceOpen,
    waybillChoiceCount,
    resolveWaybillPrintChoice,
    replacementModalOpen,
    replacementModalError,
    replacementModalDelay,
    replacementModalBusy,
    confirmReplacementLabelGenerate,
    cancelReplacementLabelModal,
  };
}
