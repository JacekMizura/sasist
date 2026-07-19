import axios from "axios";
import { extractApiErrorMessage } from "../../api/authApi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { updateWarehousePriorityTask } from "../../api/warehouseOperationsApi";
import type { WmsPackingOrderCardApi } from "../../api/wmsPackingApi";
import {
  getWmsBasketPackingOrder,
  getWmsCartPackingOrdersByCode,
  getWmsPackingOrders,
  getWmsPackingResolveShelf,
  postWmsPackingResolveEanScan,
  wmsPackingApiErrorCode,
  wmsPackingApiErrorMessage,
} from "../../api/wmsPackingApi";
import { getWmsPickingResolveCart } from "../../api/wmsPickingProductsApi";
import { OrdersListView } from "../../components/wms/packing/ordersList/OrdersListView";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { panelSidebarSubCountBadgeStyle } from "../../utils/panelSidebarHierarchy";
import { playScanBeep } from "../../utils/playScanBeep";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { formatOperationalDurationSince } from "../../utils/formatOperationalDuration";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { clearActivePriorityTask, loadActivePriorityTask, priorityTaskAppliesTo, priorityTaskOrderIds, type ActivePriorityTask } from "./activePriorityTask";
import { cartTypeMatchesPackingMode, loadWmsPackingSession, patchWmsPackingSession, type WmsPackingSessionState } from "./wmsPackingSession";
import { scanErrorMessage } from "../../components/wms/packing/packingHelpers";
import { WMS_ROUTES } from "./wmsRoutes";

async function tryPackingShelfEntry(
  scan: string,
  warehouseId: number,
  session: WmsPackingSessionState,
): Promise<{ ok: true; order_id: number } | { ok: false; notFound: true } | { ok: false; message: string }> {
  try {
    const r = await getWmsPackingResolveShelf(
      DAMAGE_TENANT_ID,
      warehouseId,
      session.statusId,
      session.mode ?? "no_cart",
      scan,
      session.mode === "bulk" || session.mode === "baskets" ? session.cartId : undefined,
    );
    // Shelf packing is its own scope — switch session so mutations use mode=shelf.
    patchWmsPackingSession({
      ...session,
      mode: "shelf",
      cartId: undefined,
      cartCode: undefined,
      cartType: undefined,
    });
    return { ok: true, order_id: r.order_id };
  } catch (e) {
    const code = wmsPackingApiErrorCode(e);
    if (code === "SHELF_NOT_FOUND") return { ok: false, notFound: true };
    const msg = wmsPackingApiErrorMessage(e) || scanErrorMessage(code);
    return { ok: false, message: msg || "Błąd skanowania półki." };
  }
}

function PriorityTaskHeader({
  task,
  visibleOrders,
  onComplete,
  onReject,
}: {
  task: ActivePriorityTask;
  visibleOrders: number;
  onComplete: () => void;
  onReject: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 border-b border-orange-100 bg-orange-50/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-wide text-orange-700">Tryb zadania kierownika</div>
          <div className="mt-0.5 truncate text-sm font-black text-slate-900">{task.title}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
            <span>{task.assigned_by_name || "Kierownik"}</span>
            <span>{visibleOrders} zamówień</span>
            <span>od {formatOperationalDurationSince(task.assigned_at)}</span>
            <span>{task.status === "W_TRAKCIE" ? "W realizacji" : task.status === "PRZYJĘTE" ? "Przyjęte" : "Aktywne"}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onComplete} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">
            Zakończ zadanie
          </button>
          <button type="button" onClick={onReject} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
            Odrzuć
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WmsPackingOrdersPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const {
    registerScanHandler,
    setActiveDocument,
    appendScanToHistory,
    refocusScannerInput,
    setScannerInputPlaceholder,
    showScannerToast,
  } = useWmsScanner();

  const [session, setSession] = useState<WmsPackingSessionState | null>(() => loadWmsPackingSession());
  const [orders, setOrders] = useState<WmsPackingOrderCardApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [activePriorityTask, setActivePriorityTask] = useState<ActivePriorityTask | null>(() => {
    const task = loadActivePriorityTask();
    return priorityTaskAppliesTo(task, "packing") ? task : null;
  });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const listScanBusyRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      const task = loadActivePriorityTask();
      setActivePriorityTask(priorityTaskAppliesTo(task, "packing") ? task : null);
    };
    window.addEventListener("wms:priority-task-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("wms:priority-task-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const refreshSession = useCallback(() => {
    setSession(loadWmsPackingSession());
  }, []);

  const fetchOrders = useCallback(async () => {
    const s = loadWmsPackingSession();
    if (!s || warehouseId == null || !s.mode) return;
    if ((s.mode === "bulk" && (s.cartId == null || !Number.isFinite(s.cartId)))) return;
    setLoading(true);
    setErr(null);
    try {
      const list = await getWmsPackingOrders(
        DAMAGE_TENANT_ID,
        warehouseId,
        s.statusId,
        s.mode,
        s.mode === "no_cart" ? undefined : s.cartId,
      );
      setOrders(list);
    } catch {
      setErr("Nie udało się wczytać zamówień.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  const assignedOrderIds = useMemo(() => priorityTaskOrderIds(activePriorityTask), [activePriorityTask]);
  const assignedOrderSet = useMemo(() => new Set(assignedOrderIds), [assignedOrderIds]);
  const visibleOrders = useMemo(
    () => (activePriorityTask && assignedOrderIds.length ? orders.filter((order) => assignedOrderSet.has(order.order_id)) : orders),
    [activePriorityTask, assignedOrderIds.length, assignedOrderSet, orders],
  );
  const completePriorityTask = useCallback(async () => {
    if (!activePriorityTask) return;
    try {
      await updateWarehousePriorityTask({ tenantId: DAMAGE_TENANT_ID, taskId: activePriorityTask.id }, { action: "complete" });
      clearActivePriorityTask(activePriorityTask.id);
      setActivePriorityTask(null);
      await fetchOrders();
    } catch {
      showScannerToast("Nie udało się zakończyć zadania kierownika.");
    }
  }, [activePriorityTask, fetchOrders, showScannerToast]);

  const rejectPriorityTask = useCallback(async () => {
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
  }, [activePriorityTask, navigate, rejectReason, showScannerToast]);

  useEffect(() => {
    if (!activePriorityTask || loading || visibleOrders.length === 0) return;
    const allDone = visibleOrders.every(
      (order) =>
        order.is_completed === true ||
        (Number(order.total_quantity || 0) > 0 && Number(order.packed_quantity || 0) >= Number(order.total_quantity || 0)),
    );
    if (allDone) {
      void completePriorityTask();
    }
  }, [activePriorityTask, completePriorityTask, loading, visibleOrders]);

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
    void fetchOrders();
  }, [navigate, fetchOrders, refreshSession]);

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Pakowanie — zamówienia" });
    return () => setActiveDocument(null);
  }, [setActiveDocument]);

  const sMode = session?.mode;
  useEffect(() => {
    if (sMode === "no_cart") {
      setScannerInputPlaceholder("Zeskanuj EAN lub półkę kompletacyjną (np. RK-01/A2)");
    } else if (sMode === "baskets") {
      setScannerInputPlaceholder("EAN, półka (RK-01/A2), koszyk lub kod wózka");
    } else {
      setScannerInputPlaceholder("EAN, półka kompletacyjna lub kod wózka");
    }
    refocusScannerInput();
  }, [setScannerInputPlaceholder, refocusScannerInput, sMode]);

  const applyCartScan = useCallback(
    async (raw: string) => {
      const scan = normalizeScanEan(raw);
      if (!scan || warehouseId == null) return;
      const s = loadWmsPackingSession();
      if (!s || s.mode === "no_cart") {
        showScannerToast("W tym trybie nie zmieniasz wózka.");
        return;
      }
      if (s.mode !== "bulk" && s.mode !== "baskets") return;
      setCartBusy(true);
      try {
        const r = await getWmsPickingResolveCart(DAMAGE_TENANT_ID, warehouseId, scan);
        if (!cartTypeMatchesPackingMode(s.mode, r.cart_type)) {
          showScannerToast(s.mode === "baskets" ? "Wybierz wózek MULTI (koszyki)." : "Wybierz wózek BULK.");
          return;
        }
        playScanBeep();
        appendScanToHistory(scan);
        const resolvedCode = (r.code && r.code.trim()) || r.barcode?.trim() || scan;
        patchWmsPackingSession({
          cartId: r.cart_id,
          cartCode: resolvedCode,
          cartType: r.cart_type?.trim() || undefined,
        });
        refreshSession();
        await fetchOrders();
      } catch {
        showScannerToast("Nie rozpoznano wózka.");
      } finally {
        setCartBusy(false);
        refocusScannerInput();
      }
    },
    [warehouseId, appendScanToHistory, showScannerToast, refreshSession, fetchOrders, refocusScannerInput],
  );

  const applyListScan = useCallback(
    async (raw: string) => {
      const scan = normalizeScanEan(raw);
      if (!scan || warehouseId == null || listScanBusyRef.current || cartBusy) return;
      const s = loadWmsPackingSession();
      if (!s?.mode) return;

      listScanBusyRef.current = true;
      let tryCart = false;
      try {
        // CASE B: baskets — najpierw warehouse-global skan koszyka → exact order
        if (s.mode === "baskets") {
          try {
            const br = await getWmsBasketPackingOrder(
              DAMAGE_TENANT_ID,
              warehouseId,
              s.statusId,
              scan,
              s.cartId ?? undefined,
            );
            playScanBeep();
            appendScanToHistory(scan);
            if (activePriorityTask && assignedOrderIds.length > 0 && !assignedOrderSet.has(br.order_id)) {
              showScannerToast("Ten koszyk jest poza aktywnym zadaniem kierownika.");
              return;
            }
            navigate(WMS_ROUTES.packingOrder(br.order_id));
            return;
          } catch (be) {
            const bcode = wmsPackingApiErrorCode(be);
            if (bcode === "AMBIGUOUS_BASKET_CODE") {
              showScannerToast(scanErrorMessage(bcode));
              return;
            }
            if (bcode === "BASKET_EMPTY") {
              showScannerToast("Koszyk jest pusty — brak przypisanego zamówienia.");
              return;
            }
            if (bcode === "BASKET_ORDER_NOT_IN_QUEUE") {
              showScannerToast("Zamówienie z tego koszyka nie jest w kolejce pakowania.");
              return;
            }
            if (bcode === "BASKET_NOT_FOUND") {
              showScannerToast("Zeskanuj koszyk (np. S-1-1) — pakowanie koszykowe nie używa globalnego EAN.");
              return;
            }
            showScannerToast(wmsPackingApiErrorMessage(be) || scanErrorMessage(bcode));
            return;
          }
        }

        try {
          const handoffScope = s.mode === "bulk" ? "CART" : "CARTLESS";
          if (s.mode === "bulk" && (s.cartId == null || !Number.isFinite(s.cartId))) {
            showScannerToast("Najpierw zeskanuj wózek.");
            return;
          }
          const out = await postWmsPackingResolveEanScan(
            DAMAGE_TENANT_ID,
            warehouseId,
            s.statusId,
            s.mode,
            scan,
            {
              cartId: s.mode === "bulk" ? s.cartId : undefined,
              handoffScope,
            },
          );
          playScanBeep();
          appendScanToHistory(scan);
          const targetOrderId = out.detail.order_id;
          if (activePriorityTask && assignedOrderIds.length > 0 && !assignedOrderSet.has(targetOrderId)) {
            showScannerToast("To zamówienie jest poza aktywnym zadaniem kierownika.");
            return;
          }
          navigate(WMS_ROUTES.packingOrder(targetOrderId), {
            state: { packingScanBootstrap: out },
          });
          return;
        } catch (e) {
          const code = wmsPackingApiErrorCode(e);
          const is404 = axios.isAxiosError(e) && e.response?.status === 404;
          if (is404 && code === "PRODUCT_NOT_FOUND") {
            const shelfHit = await tryPackingShelfEntry(scan, warehouseId, s);
            if (shelfHit.ok) {
              playScanBeep();
              appendScanToHistory(scan);
              if (activePriorityTask && assignedOrderIds.length > 0 && !assignedOrderSet.has(shelfHit.order_id)) {
                showScannerToast("To zamówienie jest poza aktywnym zadaniem kierownika.");
                return;
              }
              navigate(WMS_ROUTES.packingOrder(shelfHit.order_id));
              return;
            }
            if (!("notFound" in shelfHit)) {
              showScannerToast(shelfHit.message);
              return;
            }
            tryCart = s.mode === "bulk";
            if (!tryCart) {
              showScannerToast("Nie znaleziono produktu w kolejce.");
              return;
            }
          } else {
            if (axios.isAxiosError(e) && e.response != null && e.response.status >= 500) {
              showScannerToast("Błąd serwera.");
            } else if (code) {
              showScannerToast(scanErrorMessage(code));
            } else {
              showScannerToast("Nie znaleziono produktu w kolejce.");
            }
            return;
          }
        }
        if (tryCart) {
          await applyCartScan(scan);
        }
      } finally {
        listScanBusyRef.current = false;
        refocusScannerInput();
      }
    },
    [
      warehouseId,
      cartBusy,
      appendScanToHistory,
      navigate,
      showScannerToast,
      refocusScannerInput,
      applyCartScan,
      activePriorityTask,
      assignedOrderIds.length,
      assignedOrderSet,
    ],
  );

  useEffect(() => {
    const handler = (ean: string) => {
      void applyListScan(ean);
    };
    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [registerScanHandler, applyListScan]);

  const s = session;
  if (!s) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 bg-white px-6 text-center text-sm font-medium text-slate-500">
        Przekierowanie…
      </div>
    );
  }

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center bg-white px-6 py-12 text-center">
        <p className="max-w-md rounded-2xl border border-amber-200/90 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-950 shadow-sm">
          Wybierz magazyn w pasku u góry.
        </p>
      </div>
    );
  }

  const statusBadgeStyle = panelSidebarSubCountBadgeStyle(s.statusColor, s.mainGroup as OrderUiMainGroup);

  return (
    <div className={`flex h-full min-h-0 w-full flex-col bg-white ${activePriorityTask ? "border-t-2 border-orange-300" : ""}`}>
      {activePriorityTask ? (
        <PriorityTaskHeader
          task={activePriorityTask}
          visibleOrders={assignedOrderIds.length || visibleOrders.length}
          onComplete={() => void completePriorityTask()}
          onReject={() => {
            setRejectReason("");
            setRejectOpen(true);
          }}
        />
      ) : null}
      <OrdersListView
        orders={visibleOrders}
        loading={loading}
        error={err}
        showBasketCode={s.mode === "baskets"}
        onOpenOrder={(id) => {
          if (activePriorityTask && assignedOrderIds.length > 0 && !assignedOrderSet.has(id)) {
            showScannerToast("To zamówienie jest poza aktywnym zadaniem kierownika.");
            return;
          }
          navigate(WMS_ROUTES.packingOrder(id));
        }}
        onBack={() => {
          if (
            activePriorityTask &&
            !window.confirm("Masz aktywne zadanie kierownika. Czy na pewno chcesz opuścić zadanie?")
          ) {
            return;
          }
          navigate(WMS_ROUTES.packing);
        }}
        cartLine={
          (s.mode === "bulk" || s.mode === "baskets") && (s.cartCode ?? "").trim() !== ""
            ? { mode: s.mode, code: (s.cartCode ?? "").trim() }
            : null
        }
        statusLabelRight={s.statusName}
        statusBadgeStyle={statusBadgeStyle}
      />
      {rejectOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4">
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
    </div>
  );
}
