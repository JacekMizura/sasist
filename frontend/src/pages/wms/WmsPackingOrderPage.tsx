import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getWmsPackingResolveEan, wmsPackingApiErrorCode } from "../../api/wmsPackingApi";
import { AutoActionsView } from "../../components/wms/packing/postComplete/AutoActionsView";
import { PackingCartonGateModal } from "../../components/wms/packing/PackingCartonGateModal";
import { PackingFinalizationView } from "../../components/wms/packing/PackingFinalizationView";
import { PackingView } from "../../components/wms/packing/PackingView";
import {
  formatPackerDisplayName,
  isPackingSessionFinished,
  scanErrorMessage,
} from "../../components/wms/packing/packingHelpers";
import { usePackingOrderController } from "../../components/wms/packing/usePackingOrderController";
import { useAuth } from "../../context/AuthContext";
import { useWarehouseExecution } from "../../context/WarehouseExecutionContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { executionContextFromPacking } from "../../components/wms/execution/syncExecutionContext";
import { isSuperRole } from "../../auth/isSuperRole";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { loadActivePriorityTask, priorityTaskAppliesTo, priorityTaskOrderIds } from "./activePriorityTask";
import { loadWmsPackingSession } from "./wmsPackingSession";
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
  const { setActiveContext } = useWarehouseExecution();
  const finishWithoutCartonRef = useRef(false);

  const ctrl = usePackingOrderController(orderId, finishWithoutCartonRef);
  const activePriorityTask = loadActivePriorityTask();
  const activePackingTask = priorityTaskAppliesTo(activePriorityTask, "packing") ? activePriorityTask : null;
  const activeOrderIds = priorityTaskOrderIds(activePackingTask);
  const [dismissPostPacking, setDismissPostPacking] = useState(false);
  const [resumeScanBusy, setResumeScanBusy] = useState(false);
  const packerDisplayName = formatPackerDisplayName(user);

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Pakowanie — zamówienie" });
    return () => setActiveDocument(null);
  }, [setActiveDocument]);

  useEffect(() => {
    if (!ctrl.detail) {
      setActiveContext(null);
      return;
    }
    const d = ctrl.detail;
    const remaining = Math.max(0, (d.total_quantity ?? 0) - (d.packed_quantity ?? 0));
    const cartonLabel = d.selected_carton?.name ?? d.selected_carton_id ?? null;
    setActiveContext(
      executionContextFromPacking({
        orderNumber: d.number,
        orderId: d.order_id,
        cartCode: ctrl.session?.cartCode ?? d.cart_display_code ?? d.wms_vehicle_label,
        cartName: ctrl.session?.cartType,
        remainingQty: remaining,
        currentStep: ctrl.awaitingPostPackCarton
          ? "Wybierz karton"
          : ctrl.awaitingFinalizationRun
            ? "Finalizacja zamówienia"
            : "Skanuj produkt do spakowania",
        operatorName: packerDisplayName,
        targetLocation: cartonLabel ?? "KARTON",
      }),
    );
    return () => setActiveContext(null);
  }, [
    ctrl.awaitingFinalizationRun,
    ctrl.awaitingPostPackCarton,
    ctrl.detail,
    ctrl.session?.cartCode,
    ctrl.session?.cartType,
    packerDisplayName,
    setActiveContext,
  ]);

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
      if ((s.mode === "bulk" || s.mode === "baskets") && (s.cartId == null || !Number.isFinite(s.cartId))) return;

      setResumeScanBusy(true);
      try {
        const { order_id: targetOrderId } = await getWmsPackingResolveEan(
          DAMAGE_TENANT_ID,
          ctrl.warehouseId,
          s.statusId,
          s.mode,
          ean,
          s.mode === "no_cart" ? undefined : s.cartId,
        );
        playScanBeep();
        appendScanToHistory(ean);
        if (activePackingTask && activeOrderIds.length > 0 && !activeOrderIds.includes(targetOrderId)) {
          showScannerToast("To zamówienie jest poza aktywnym zadaniem kierownika.");
          return;
        }
        if (targetOrderId !== orderId) {
          navigate(WMS_ROUTES.packingOrder(targetOrderId), { replace: true });
        } else {
          showScannerToast("Brak innego zamówienia w kolejce z tym produktem do spakowania.");
        }
      } catch (e) {
        const code = wmsPackingApiErrorCode(e);
        if (axios.isAxiosError(e) && e.response?.status === 404 && code === "PRODUCT_NOT_FOUND") {
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
      <PackingCartonGateModal
        open={ctrl.awaitingPostPackCarton}
        shippingMethodLogoUrl={packingDetail.shipping_method_logo_url}
        shippingTemplateLabel={shippingTemplateLabel}
        compatible={packingDetail.shipping_compatible_cartons ?? []}
        packagingSuggestions={packingDetail.packaging_suggestions}
        selectedCartonId={packingDetail.selected_carton_id}
        selectedPackagingIds={ctrl.selectedPackagingIds}
        busy={ctrl.selectCartonBusy}
        canContinueWithoutCarton={canFinishWithoutCarton}
        onSelectCarton={(id) => void ctrl.selectCarton(id)}
        onProceedToFinalization={() => ctrl.proceedToFinalization()}
        onContinueWithoutCarton={() => ctrl.continueWithoutCartonToFinalization()}
        onAddOwnPackaging={
          isSuperRole(user?.role)
            ? () =>
                showScannerToast("Skonfiguruj materiał opakowaniowy w ustawieniach magazynu (powiązanie z metodą wysyłki).")
            : undefined
        }
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
        onInterrupt={() => navigate(WMS_ROUTES.packingOrders)}
        recommendedCartons={packingDetail.recommended_cartons ?? []}
        selectedCartonId={packingDetail.selected_carton_id}
        onSelectCarton={(id) => void ctrl.selectCarton(id)}
        selectCartonBusy={ctrl.selectCartonBusy}
        interfaceDisplay={ctrl.packingInterfaceDisplay}
        packerDisplayName={packerDisplayName}
        packingActionsLocked={ctrl.awaitingPostPackCarton}
        showHeaderCartonPicker={false}
      />
    </>
  );
}
