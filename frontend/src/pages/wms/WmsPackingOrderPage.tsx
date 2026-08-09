import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getWmsPackingResolveShelf,
  postWmsPackingMarkShortage,
  postWmsPackingResolveEanScan,
  wmsPackingApiErrorCode,
  wmsPackingApiErrorMessage,
} from "../../api/wmsPackingApi";
import { getWmsPackingSettings } from "../../api/wmsPackingSettingsApi";
import { getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import { buildOrderUiStatusNameById } from "../../components/orders/automation/buildOrderUiStatusNameById";
import { AutoActionsView } from "../../components/wms/packing/postComplete/AutoActionsView";
import { PackingCartonGateModal } from "../../components/wms/packing/PackingCartonGateModal";
import { PackingFinalizationView } from "../../components/wms/packing/PackingFinalizationView";
import { PackingMarkShortageModal } from "../../components/wms/packing/PackingMarkShortageModal";
import { PackingNotesPopupModal } from "../../components/wms/packing/PackingNotesPopupModal";
import { PackingReplacementLabelModal } from "../../components/wms/packing/PackingReplacementLabelModal";
import { PackingView } from "../../components/wms/packing/PackingView";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { ChoiceModal } from "../../components/ui/ChoiceModal";
import {
  formatPackerDisplayName,
  isPackingSessionFinished,
  orderNumberLabel,
  scanErrorMessage,
} from "../../components/wms/packing/packingHelpers";
import { usePackingOrderController } from "../../components/wms/packing/usePackingOrderController";
import { useAuth } from "../../context/AuthContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { isSuperRole } from "../../auth/isSuperRole";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { loadActivePriorityTask, priorityTaskAppliesTo, priorityTaskOrderIds } from "./activePriorityTask";
import { loadWmsPackingSession, patchWmsPackingSession } from "./wmsPackingSession";
import { WMS_ROUTES } from "./wmsRoutes";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { playScanBeep } from "../../utils/playScanBeep";

/**
 * WMS — pakowanie wieloproduktowe (jeden ekran, skan jako główny kanał).
 * Po domknięciu: `AutoActionsView` (bez auto-nawigacji do następnego zamówienia); dalszy skan → `resolve-ean` → przejście tylko po wyborze użytkownika / trafieniu w kolejkę.
 */
export default function WmsPackingOrderPage() {
  const { orderId: orderIdParam } = useParams<{ orderId: string }>();
  const orderId = Number(orderIdParam);
  const navigate = useNavigate();
  const { setActiveDocument, showScannerToast, appendScanToHistory, refocusScannerInput } = useWmsScanner();
  const { user } = useAuth();
  const finishWithoutCartonRef = useRef(false);

  const ctrl = usePackingOrderController(orderId, finishWithoutCartonRef);
  const activePriorityTask = loadActivePriorityTask();
  const activePackingTask = priorityTaskAppliesTo(activePriorityTask, "packing") ? activePriorityTask : null;
  const activeOrderIds = priorityTaskOrderIds(activePackingTask);
  const [dismissPostPacking, setDismissPostPacking] = useState(false);
  const [resumeScanBusy, setResumeScanBusy] = useState(false);
  const [shortageLineId, setShortageLineId] = useState<number | null>(null);
  const [shortageStatusName, setShortageStatusName] = useState<string | null>(null);
  const [shortageNotConfigured, setShortageNotConfigured] = useState(false);
  const [shortageBusy, setShortageBusy] = useState(false);
  const packerDisplayName = formatPackerDisplayName(user);

  const leavePackingToList = useCallback(() => {
    // Ta sama ścieżka co „Przerwij” — respektuje tryb sesji (wózek / koszyki / no_cart / shelf).
    navigate(WMS_ROUTES.packingOrders);
  }, [navigate]);

  const onMarkLineShortage = useCallback(
    async (orderItemId: number) => {
      if (ctrl.warehouseId == null) return;
      setShortageLineId(orderItemId);
      setShortageBusy(false);
      setShortageNotConfigured(false);
      setShortageStatusName(null);
      try {
        const [settings, summary] = await Promise.all([
          getWmsPackingSettings(DAMAGE_TENANT_ID, ctrl.warehouseId),
          getOrderUiStatusSummary(DAMAGE_TENANT_ID, ctrl.warehouseId, { includeInactive: true }).catch(() => null),
        ]);
        const sid = settings.missing_status_id;
        if (sid == null || sid <= 0) {
          setShortageNotConfigured(true);
          return;
        }
        const names = buildOrderUiStatusNameById(summary);
        setShortageStatusName(names.get(sid) ?? `#${sid}`);
      } catch {
        setShortageNotConfigured(true);
      }
    },
    [ctrl.warehouseId],
  );

  const confirmMarkShortage = useCallback(async () => {
    if (ctrl.warehouseId == null || shortageLineId == null || !Number.isFinite(orderId) || orderId < 1) return;
    if (shortageNotConfigured) {
      setShortageLineId(null);
      return;
    }
    setShortageBusy(true);
    try {
      await postWmsPackingMarkShortage(DAMAGE_TENANT_ID, ctrl.warehouseId, orderId, shortageLineId);
      setShortageLineId(null);
      leavePackingToList();
    } catch (e) {
      const code = wmsPackingApiErrorCode(e);
      const msg = wmsPackingApiErrorMessage(e);
      if (code === "MISSING_STATUS_NOT_CONFIGURED") {
        setShortageNotConfigured(true);
      } else {
        showScannerToast(msg || scanErrorMessage(code) || "Nie udało się oznaczyć braku.");
        setShortageLineId(null);
      }
    } finally {
      setShortageBusy(false);
    }
  }, [
    ctrl.warehouseId,
    shortageLineId,
    orderId,
    shortageNotConfigured,
    leavePackingToList,
    showScannerToast,
  ]);

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Pakowanie — zamówienie" });
    return () => setActiveDocument(null);
  }, [setActiveDocument]);

  useEffect(() => {
    setDismissPostPacking(false);
    setResumeScanBusy(false);
    finishWithoutCartonRef.current = false;
  }, [orderId]);
  const canFinishWithoutCarton =
    isSuperRole(user?.role) ||
    Boolean(user?.wms_profile?.packing_permissions?.includes("finish_without_carton"));

  const onResumeProductScan = useCallback(
    async (raw: string) => {
      const ean = normalizeScanEan(raw);
      if (!ean || ctrl.warehouseId == null || resumeScanBusy) return;
      const s = loadWmsPackingSession();
      if (!s?.mode || !Number.isFinite(orderId) || orderId < 1) return;
      if ((s.mode === "bulk" && (s.cartId == null || !Number.isFinite(s.cartId)))) return;

      setResumeScanBusy(true);
      try {
        const out = await postWmsPackingResolveEanScan(
          DAMAGE_TENANT_ID,
          ctrl.warehouseId,
          s.statusId,
          s.mode,
          ean,
          {
            cartId: s.mode === "bulk" ? s.cartId : s.mode === "baskets" ? s.cartId : undefined,
            handoffScope: s.mode === "bulk" ? "CART" : s.mode === "baskets" ? "BASKET" : "CARTLESS",
            orderId: s.mode === "baskets" ? orderId : undefined,
          },
        );
        playScanBeep();
        appendScanToHistory(ean);
        const targetOrderId = out.detail.order_id;
        if (activePackingTask && activeOrderIds.length > 0 && !activeOrderIds.includes(targetOrderId)) {
          showScannerToast("To zamówienie jest poza aktywnym zadaniem kierownika.");
          return;
        }
        if (targetOrderId !== orderId) {
          navigate(WMS_ROUTES.packingOrder(targetOrderId), {
            replace: true,
            state: { packingScanBootstrap: out },
          });
        } else {
          showScannerToast("Brak innego zamówienia w kolejce z tym produktem do spakowania.");
        }
      } catch (e) {
        const code = wmsPackingApiErrorCode(e);
        if (axios.isAxiosError(e) && e.response?.status === 404 && code === "PRODUCT_NOT_FOUND") {
          try {
            const shelf = await getWmsPackingResolveShelf(
              DAMAGE_TENANT_ID,
              ctrl.warehouseId,
              s.statusId,
              s.mode,
              ean,
              s.mode === "bulk" || s.mode === "baskets" ? s.cartId : undefined,
            );
            playScanBeep();
            appendScanToHistory(ean);
            if (activePackingTask && activeOrderIds.length > 0 && !activeOrderIds.includes(shelf.order_id)) {
              showScannerToast("To zamówienie jest poza aktywnym zadaniem kierownika.");
              return;
            }
            patchWmsPackingSession({
              mode: "shelf",
              cartId: undefined,
              cartCode: undefined,
              cartType: undefined,
            });
            navigate(WMS_ROUTES.packingOrder(shelf.order_id), { replace: true });
            return;
          } catch (se) {
            const shelfCode = wmsPackingApiErrorCode(se);
            if (shelfCode !== "SHELF_NOT_FOUND") {
              showScannerToast(wmsPackingApiErrorMessage(se) || scanErrorMessage(shelfCode));
              return;
            }
          }
          showScannerToast("Nie znaleziono zamówienia z tym produktem w kolejce.");
        } else {
          showScannerToast(scanErrorMessage(code));
        }
      } finally {
        setResumeScanBusy(false);
        refocusScannerInput();
      }
    },
    [
      ctrl.warehouseId,
      orderId,
      resumeScanBusy,
      navigate,
      appendScanToHistory,
      showScannerToast,
      refocusScannerInput,
      activePackingTask,
      activeOrderIds,
    ],
  );

  if (!ctrl.session || !Number.isFinite(orderId) || orderId < 1) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-white text-sm font-medium text-slate-600">
        Przekierowanie…
      </div>
    );
  }

  if (ctrl.warehouseId == null) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-white px-4">
        <p className="max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-base font-medium text-amber-950">
          Wybierz magazyn na górnym pasku.
        </p>
      </div>
    );
  }

  if (activePackingTask && activeOrderIds.length > 0 && !activeOrderIds.includes(orderId)) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-white px-4">
        <div className="max-w-md rounded-2xl border border-orange-200 bg-orange-50/70 p-5 text-center shadow-sm">
          <div className="text-sm font-black text-slate-900">Tryb zadania kierownika</div>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            To zamówienie nie należy do aktywnego zadania. Wróć do listy przypisanych zamówień.
          </p>
          <button type="button" onClick={() => navigate(WMS_ROUTES.packingOrders)} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">
            Pokaż zadanie
          </button>
        </div>
      </div>
    );
  }

  if (ctrl.loadErr) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col bg-white">
        <div className="shrink-0 border-b border-slate-200 p-3">
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-indigo-50 hover:text-indigo-950"
            onClick={() => navigate(WMS_ROUTES.packingOrders)}
          >
            ← Zamówienia
          </button>
        </div>
        <p className="flex flex-1 items-center justify-center px-4 text-center text-lg font-medium text-red-700">{ctrl.loadErr}</p>
      </div>
    );
  }

  if (!ctrl.detail) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-white px-6 text-center text-lg font-medium text-slate-500">
        Ładowanie…
      </div>
    );
  }

  const packingDetail = ctrl.detail;

  const packingSessionDone = isPackingSessionFinished(packingDetail);
  const showAutoActions =
    packingSessionDone &&
    !dismissPostPacking &&
    !ctrl.postPackFinishBusy &&
    !ctrl.awaitingPostPackCarton &&
    !ctrl.awaitingFinalizationRun;

  const shippingTemplateLabel = (() => {
    const m = (packingDetail.shipping_method_name ?? packingDetail.shipping_method ?? "").trim();
    if (!m) return "—";
    return packingDetail.pickup_point === true ? `${m} — punkt odbioru` : m;
  })();

  if (showAutoActions) {
    return (
      <AutoActionsView
        detail={packingDetail}
        postPackPipeline={ctrl.postPackPipeline}
        onBackToOrders={() => navigate(WMS_ROUTES.packingOrders)}
        onBackToOrder={() => setDismissPostPacking(true)}
        onEditSellasist={() => navigate(`/orders/${packingDetail.order_id}`)}
        onResumeProductScan={onResumeProductScan}
        resumeScanBusy={resumeScanBusy}
      />
    );
  }

  if (ctrl.awaitingFinalizationRun) {
    return (
      <PackingFinalizationView
        detail={packingDetail}
        runPostPackFinish={ctrl.runPostPackFinish}
        postPackFinishBusy={ctrl.postPackFinishBusy}
      />
    );
  }

  return (
    <>
      <PackingNotesPopupModal
        open={ctrl.notesPopupOpen}
        notes={ctrl.visiblePackingNotes}
        orderNumber={orderNumberLabel(packingDetail.number)}
        onClose={ctrl.acknowledgeNotesPopup}
      />
      <PackingCartonGateModal
        open={ctrl.awaitingPostPackCarton}
        shippingMethodLogoUrl={packingDetail.shipping_method_logo_url}
        shippingTemplateLabel={shippingTemplateLabel}
        compatible={packingDetail.shipping_compatible_cartons ?? []}
        packagingSuggestions={packingDetail.packaging_suggestions}
        selectedCartonId={packingDetail.selected_carton_id}
        selectedPackagingIds={ctrl.selectedPackagingIds}
        busy={ctrl.selectCartonBusy}
        canContinueWithoutCarton={canFinishWithoutCarton && !ctrl.packingExtendedUi.enableMultiParcel}
        enableMultiParcel={ctrl.packingExtendedUi.enableMultiParcel}
        onSelectCarton={(id) => void ctrl.selectCarton(id)}
        onProceedToFinalization={() => ctrl.proceedToFinalization()}
        onContinueWithoutCarton={() => ctrl.continueWithoutCartonToFinalization()}
        onAddOwnPackaging={
          ctrl.packingExtendedUi.enableMultiParcel
            ? () => showScannerToast("Wybierz opakowanie z listy — zostanie dodane jako kolejna paczka.")
            : isSuperRole(user?.role)
              ? () =>
                  showScannerToast(
                    "Skonfiguruj materiał opakowaniowy w ustawieniach magazynu (powiązanie z metodą wysyłki).",
                  )
              : undefined
        }
      />
      {ctrl.shipmentConfirmOpen ? (
        <ConfirmModal
          title="Wygenerować list przewozowy?"
          message="Za chwilę zostanie wygenerowany list przewozowy dla tego zamówienia."
          confirmLabel="Generuj list przewozowy"
          confirmTone="default"
          onConfirm={() => ctrl.resolveShipmentConfirm(true)}
          onCancel={() => ctrl.resolveShipmentConfirm(false)}
        />
      ) : null}
      {ctrl.waybillChoiceOpen ? (
        <ChoiceModal
          title="Ile listów przewozowych wydrukować?"
          message={`Zamówienie ma ${ctrl.waybillChoiceCount} listów przewozowych. Wybierz, ile wydrukować.`}
          showCancel={false}
          actions={[
            {
              label: "Wydrukuj jeden",
              onClick: () => ctrl.resolveWaybillPrintChoice("one"),
            },
            {
              label: "Wydrukuj wszystkie",
              tone: "primary",
              onClick: () => ctrl.resolveWaybillPrintChoice("all"),
            },
          ]}
          onCancel={() => ctrl.resolveWaybillPrintChoice("one")}
        />
      ) : null}
      <PackingReplacementLabelModal
        open={ctrl.replacementModalOpen}
        errorMessage={ctrl.replacementModalError}
        delaySeconds={ctrl.replacementModalDelay}
        busy={ctrl.replacementModalBusy}
        onGenerate={() => ctrl.confirmReplacementLabelGenerate()}
        onClose={() => ctrl.cancelReplacementLabelModal()}
      />
      <PackingMarkShortageModal
        open={shortageLineId != null}
        missingStatusName={shortageStatusName}
        missingStatusNotConfigured={shortageNotConfigured}
        busy={shortageBusy}
        onCancel={() => {
          if (!shortageBusy) setShortageLineId(null);
        }}
        onConfirm={() => void confirmMarkShortage()}
      />
      <PackingView
        detail={packingDetail}
        sortedLines={ctrl.sortedLines}
        activeProductId={ctrl.activeProductId}
        flashItemId={ctrl.flashItemId}
        packQty={ctrl.packQty}
        scanBusy={ctrl.scanBusy}
        linePackBusy={ctrl.linePackBusy}
        onScan={ctrl.onScan}
        confirmPack={ctrl.confirmPack}
        packAll={ctrl.packAll}
        activateProduct={ctrl.activateProduct}
        onPackQtyChange={ctrl.onPackQtyChange}
        navigate={navigate}
        refocusScannerInput={ctrl.refocusScannerInput}
        onInterrupt={leavePackingToList}
        recommendedCartons={packingDetail.recommended_cartons ?? []}
        selectedCartonId={packingDetail.selected_carton_id}
        onSelectCarton={(id) => void ctrl.selectCarton(id)}
        selectCartonBusy={ctrl.selectCartonBusy}
        interfaceDisplay={ctrl.packingInterfaceDisplay}
        productFieldVisibility={ctrl.packingProductFieldVisibility}
        packerDisplayName={packerDisplayName}
        packingActionsLocked={ctrl.awaitingPostPackCarton || ctrl.notesPopupOpen || shortageBusy}
        visibleOperationalNotes={ctrl.visiblePackingNotes}
        bundlePackScan={ctrl.bundlePackScan}
        showHeaderCartonPicker
        showProceedAfterLinesCompleteCta={ctrl.showProceedAfterLinesCompleteCta}
        onProceedAfterLinesComplete={ctrl.proceedAfterLinesComplete}
        onMarkLineShortage={(id) => void onMarkLineShortage(id)}
        showAutomationButtons={ctrl.packingExtendedUi.showAutomationButtons}
        automationButtonsPosition={ctrl.packingExtendedUi.automationButtonsPosition}
        warehouseId={ctrl.warehouseId}
        onAutomationToast={showScannerToast}
        onAutomationStatusChanged={() => void ctrl.fetchDetail()}
        customerCommentStyle={ctrl.packingExtendedUi.customerCommentStyle}
        salesDocumentPreview={ctrl.packingExtendedUi.salesDocumentPreview}
        layoutMode={ctrl.packingExtendedUi.layoutMode}
        productDisplayMode={ctrl.packingExtendedUi.productDisplayMode}
        showOrderPhone={ctrl.packingExtendedUi.showOrderPhone}
        showOrderValue={ctrl.packingExtendedUi.showOrderValue}
        showShippingAddress={ctrl.packingExtendedUi.showShippingAddress}
      />
    </>
  );
}
