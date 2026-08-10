import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getPickingActiveSession,
  getPickingConfiguredStatuses,
  getWmsPickingFlowConfig,
  type WmsPickingActiveSessionApi,
} from "../../api/wmsPickingEntryApi";
import { getWmsPickingResolveCart, postWmsPickingStart } from "../../api/wmsPickingProductsApi";
import { useWmsMessage } from "../../components/wms/WmsMessageProvider";
import { useWmsPickingCart } from "../../context/WmsPickingCartContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { playScanBeep } from "../../utils/playScanBeep";
import { SCAN_CONSUMED } from "../../utils/wmsScanDispatch";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsFlowStatusTileButton } from "./WmsFlowStatusTileButton";
import { resolveAfterStatusWithConfig, sessionWithPickingFlowConfig } from "./wmsPickingFlowResolve";
import {
  findActiveStatusRowForSession,
  looksLikePickingCartCode,
  scanMatchesAssignedCart,
  statusRowCartBadgeLabel,
  statusRowHasActiveSession,
  statusRowShowScanCartCta,
} from "./wmsPickingStatusSession";
import { WMS_ROUTES } from "./wmsRoutes";
import { Loader2, AlertTriangle } from "lucide-react";

type StatusRow = Awaited<ReturnType<typeof getPickingConfiguredStatuses>>[number];

type LoadState = "idle" | "loading" | "ready" | "error";

/**
 * Ekran statusów zbierania.
 * Aktywna sesja (API) = jedyne źródło prawdy dla badge / CTA / skanu wózka.
 * Handler skanera jest ZAWSZE zarejestrowany na tym ekranie — nigdy „nie obsługuje skanera”.
 */
export default function WmsPickingStatusPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { setPickingCart, snapshot } = useWmsPickingCart();
  const { showWmsError, showWmsMessage } = useWmsMessage();
  const {
    registerScanHandler,
    setScannerInputPlaceholder,
    refocusScannerInput,
    appendScanToHistory,
    showScanFeedbackFromCode,
    showScannerToast,
  } = useWmsScanner();

  const [rows, setRows] = useState<StatusRow[]>([]);
  const [activeSession, setActiveSession] = useState<WmsPickingActiveSessionApi | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [resolvingStatusId, setResolvingStatusId] = useState<number | null>(null);
  /** Jawny start nowej sesji — tylko status BEZ aktywnej sesji. */
  const [scanTargetStatusId, setScanTargetStatusId] = useState<number | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const scanBusyRef = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;
  const scanTargetRef = useRef(scanTargetStatusId);
  scanTargetRef.current = scanTargetStatusId;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      setActiveSession(null);
      setLoadState("idle");
      setErr(null);
      return;
    }
    setLoadState("loading");
    setErr(null);
    try {
      const [data, active] = await Promise.all([
        getPickingConfiguredStatuses(DAMAGE_TENANT_ID, warehouseId),
        getPickingActiveSession(DAMAGE_TENANT_ID, warehouseId).catch(() => null),
      ]);
      setRows(data);
      setActiveSession(active);
      setLoadState("ready");

      const bound =
        active?.has_active_session && active.cart_id != null && active.cart_id > 0
          ? active
          : null;
      if (bound) {
        setPickingCart({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId,
          cartId: bound.cart_id!,
          cartCode: (bound.cart_code || "").trim() || `CART-${bound.cart_id}`,
          cartName: bound.cart_name?.trim() || undefined,
          cartType:
            bound.cart_type === "BASKETS" ? "multi" : bound.cart_type === "BULK" ? "bulk" : undefined,
        });
      } else {
        for (const r of data) {
          if (!statusRowHasActiveSession(r) || r.active_cart_id == null) continue;
          setPickingCart({
            tenantId: DAMAGE_TENANT_ID,
            warehouseId,
            cartId: r.active_cart_id,
            cartCode: (r.active_cart_code || "").trim() || `CART-${r.active_cart_id}`,
            cartName: r.active_cart_name?.trim() || undefined,
            cartType:
              r.active_cart_type === "BASKETS"
                ? "multi"
                : r.active_cart_type === "BULK"
                  ? "bulk"
                  : undefined,
          });
          break;
        }
      }
    } catch {
      setErr("Nie udało się wczytać statusów z konfiguracji zbierania.");
      setRows([]);
      setActiveSession(null);
      setLoadState("error");
    }
  }, [warehouseId, setPickingCart]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const startNewSessionFromScan = useCallback(
    async (rawCode: string, target: StatusRow) => {
      if (warehouseId == null || !target.require_cart || !target.cart_type) return SCAN_CONSUMED;
      if (statusRowHasActiveSession(target)) {
        showScannerToast("Masz już aktywną sesję. Otwórz kartę statusu, zamiast skanować wózek ponownie.");
        setScanTargetStatusId(null);
        return SCAN_CONSUMED;
      }
      const code = normalizeScanEan(rawCode);
      if (!code || scanBusyRef.current) return SCAN_CONSUMED;
      scanBusyRef.current = true;
      setScanBusy(true);
      setErr(null);
      try {
        // Typ wyłącznie z wybranego statusu — nigdy z innego kafelka.
        const r = await getWmsPickingResolveCart(DAMAGE_TENANT_ID, warehouseId, code, {
          expectedCartType: target.cart_type,
          sourceStatusId: target.source_status_id,
        });
        const startResult = await postWmsPickingStart(
          DAMAGE_TENANT_ID,
          warehouseId,
          r.cart_id,
          target.source_status_id,
          "all",
        );
        if (startResult.operator_message) {
          showWmsMessage({
            code: "PICK_NO_ASSIGNABLE_AFTER_VALIDATION",
            severity: "WARNING",
            title: "Zbieranie",
            message: startResult.operator_message,
            details: null,
            suggested_action: null,
          });
        }
        const cartCodeResolved = (r.code && r.code.trim()) || r.barcode?.trim() || code;
        const cartName =
          (r.display_name && r.display_name.trim()) || (r.name && r.name.trim()) || undefined;
        const phys = (r.cart_type || "").trim().toLowerCase() || undefined;
        setPickingCart({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId,
          cartId: r.cart_id,
          cartCode: cartCodeResolved,
          cartName,
          cartType: phys,
        });
        playScanBeep();
        appendScanToHistory(code);
        setScanTargetStatusId(null);

        const cfg = await getWmsPickingFlowConfig(
          DAMAGE_TENANT_ID,
          warehouseId,
          target.source_status_id,
        );
        const session = {
          ...sessionWithPickingFlowConfig(
            {
              orderUiStatusId: target.source_status_id,
              orderUiStatusName: target.status,
              orderUiStatusColor: target.color,
              mainGroup: target.main_group as OrderUiMainGroup,
              cartId: r.cart_id,
              cartCode: cartCodeResolved,
              cartName: cartName ?? null,
              physicalCartType: phys ?? null,
              pickingSessionId: startResult.session_id ?? null,
            },
            cfg,
          ),
          requireCart: true as const,
          cartType: target.cart_type,
          orderTypeChoice: "all" as const,
          cartless: false as const,
          assignEmptyMessage: startResult.operator_message ?? null,
        };
        navigate(WMS_ROUTES.pickingProducts, {
          state: { pickingSession: session },
        });
      } catch (e) {
        showWmsError(e);
        showScanFeedbackFromCode("INVALID_CART_SCAN");
        refocusScannerInput();
      } finally {
        scanBusyRef.current = false;
        setScanBusy(false);
      }
      return SCAN_CONSUMED;
    },
    [
      warehouseId,
      setPickingCart,
      showWmsMessage,
      showWmsError,
      appendScanToHistory,
      showScanFeedbackFromCode,
      refocusScannerInput,
      navigate,
      showScannerToast,
    ],
  );

  // ZAWSZE rejestruj handler na liście statusów — aktywna sesja / start / informacja.
  useEffect(() => {
    if (warehouseId == null) {
      registerScanHandler(null);
      return;
    }

    const targetId = scanTargetStatusId;
    const target =
      targetId != null ? rows.find((r) => r.source_status_id === targetId) : null;
    const waitingNewScan =
      target != null &&
      target.require_cart &&
      Boolean(target.cart_type) &&
      !statusRowHasActiveSession(target);

    setScannerInputPlaceholder(
      waitingNewScan
        ? target!.cart_type === "BASKETS"
          ? "Zeskanuj wózek z koszykami"
          : "Zeskanuj wózek"
        : "Skan wózka / wybierz status",
    );
    refocusScannerInput();

    const handler = (ean: string) => {
      const code = normalizeScanEan(ean);
      if (!code) return SCAN_CONSUMED;

      const active = activeSessionRef.current;
      const latestRows = rowsRef.current;
      const activeRow = findActiveStatusRowForSession(latestRows, active);
      const snap = snapshotRef.current;

      const assigned = {
        cartCode: active?.cart_code || activeRow?.active_cart_code || snap?.cartCode || null,
        cartName: active?.cart_name || activeRow?.active_cart_name || snap?.cartName || null,
        cartId: active?.cart_id || activeRow?.active_cart_id || snap?.cartId || null,
      };
      const hasAssignedCart =
        (assigned.cartId != null && assigned.cartId > 0) ||
        Boolean((assigned.cartCode || "").trim()) ||
        (active?.has_active_session === true && active.has_cart);

      // 1) Aktywna sesja z wózkiem — NIGDY resolve-cart.
      if (hasAssignedCart && (scanMatchesAssignedCart(code, assigned) || looksLikePickingCartCode(code))) {
        const label = (assigned.cartName || assigned.cartCode || "przypisany").trim();
        if (scanMatchesAssignedCart(code, assigned) || looksLikePickingCartCode(code)) {
          appendScanToHistory(code);
          showScannerToast(`Masz już przypisany wózek: ${label}`);
          setScanTargetStatusId(null);
          setErr(null);
          return SCAN_CONSUMED;
        }
      }

      // 2) Jawny start nowej sesji dla wybranego statusu.
      const sid = scanTargetRef.current;
      if (sid != null) {
        const t = latestRows.find((r) => r.source_status_id === sid);
        if (t && !statusRowHasActiveSession(t) && t.require_cart && t.cart_type) {
          void startNewSessionFromScan(code, t);
          return SCAN_CONSUMED;
        }
        setScanTargetStatusId(null);
      }

      // 3) Brak sesji, skan wózka bez wybranego statusu — nie zgaduj BASKETS/BULK.
      if (looksLikePickingCartCode(code) && !hasAssignedCart) {
        appendScanToHistory(code);
        showScannerToast("Wybierz status i kliknij „Zeskanuj wózek”, albo otwórz kartę statusu.");
        return SCAN_CONSUMED;
      }

      appendScanToHistory(code);
      showScannerToast("Na liście statusów zeskanuj wózek albo wybierz kartę.");
      return SCAN_CONSUMED;
    };

    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [
    warehouseId,
    rows,
    scanTargetStatusId,
    registerScanHandler,
    setScannerInputPlaceholder,
    refocusScannerInput,
    startNewSessionFromScan,
    appendScanToHistory,
    showScannerToast,
  ]);

  const resumeOrStart = async (r: StatusRow) => {
    if (warehouseId == null || resolvingStatusId != null || scanBusy) return;
    if (loadState === "loading") return;

    const active = statusRowHasActiveSession(r);
    const globalActive = activeSession?.has_active_session === true;
    const thisIsGlobal =
      globalActive &&
      (activeSession.source_status_id === r.source_status_id ||
        activeSession.session_id === r.active_session_id ||
        (activeSession.cart_id != null && activeSession.cart_id === r.active_cart_id));

    // Start nowej sesji — tylko gdy ta karta NIE ma sesji.
    if (r.require_cart && !active && !thisIsGlobal) {
      setScanTargetStatusId(r.source_status_id);
      setErr(
        r.cart_type === "BASKETS"
          ? "Zeskanuj wózek z koszykami dla tego statusu."
          : "Zeskanuj wózek dla tego statusu.",
      );
      refocusScannerInput();
      return;
    }

    const cartId =
      r.active_cart_id ??
      (thisIsGlobal ? activeSession?.cart_id : null) ??
      null;
    const reused =
      cartId != null && cartId > 0
        ? {
            cartId,
            cartCode:
              (r.active_cart_code || activeSession?.cart_code || "").trim() || `CART-${cartId}`,
            cartName: (r.active_cart_name || activeSession?.cart_name || "").trim() || null,
            physicalCartType:
              (r.active_cart_type || activeSession?.cart_type) === "BASKETS"
                ? "multi"
                : (r.active_cart_type || activeSession?.cart_type) === "BULK"
                  ? "bulk"
                  : null,
          }
        : null;

    if (reused) {
      setPickingCart({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
        cartId: reused.cartId,
        cartCode: reused.cartCode,
        cartName: reused.cartName ?? undefined,
        cartType: reused.physicalCartType ?? undefined,
      });
    }

    const orderTypeChoice =
      r.active_order_type === "single" ||
      r.active_order_type === "multi" ||
      r.active_order_type === "all"
        ? r.active_order_type
        : activeSession?.order_type === "single" ||
            activeSession?.order_type === "multi" ||
            activeSession?.order_type === "all"
          ? activeSession.order_type
          : ("all" as const);

    const resumeStatusId =
      r.session_source_status_id != null && r.session_source_status_id > 0
        ? r.session_source_status_id
        : activeSession?.source_status_id != null && activeSession.source_status_id > 0
          ? activeSession.source_status_id
          : r.source_status_id;

    const sessionCartType =
      r.active_cart_type === "BASKETS" || r.active_cart_type === "BULK"
        ? r.active_cart_type
        : activeSession?.cart_type === "BASKETS" || activeSession?.cart_type === "BULK"
          ? activeSession.cart_type
          : r.cart_type;

    const sessionId = r.active_session_id ?? activeSession?.session_id ?? null;

    setResolvingStatusId(r.source_status_id);
    setErr(null);
    setScanTargetStatusId(null);
    try {
      const cfg = await getWmsPickingFlowConfig(DAMAGE_TENANT_ID, warehouseId, resumeStatusId);
      const session = {
        ...sessionWithPickingFlowConfig(
          {
            orderUiStatusId: resumeStatusId,
            orderUiStatusName: r.status,
            orderUiStatusColor: r.color,
            mainGroup: r.main_group as OrderUiMainGroup,
            pickingSessionId: sessionId,
            ...(reused
              ? {
                  cartId: reused.cartId,
                  cartCode: reused.cartCode,
                  cartName: reused.cartName,
                  physicalCartType: reused.physicalCartType,
                }
              : {}),
          },
          cfg,
        ),
        orderTypeChoice,
        ...(reused
          ? {
              requireCart: true as const,
              cartType: sessionCartType,
              cartless: false as const,
            }
          : {}),
        hubOrderCount: Number(r.order_count) || 0,
        hubPickStats: {
          zebrane: Math.max(0, Number(r.session_products_picked) || 0),
          doZebrania: Math.max(
            0,
            (Number(r.session_products_total) || 0) - (Number(r.session_products_picked) || 0),
          ),
          wTrakcie: 0,
          braki: 0,
        },
      };
      const { path, state } = resolveAfterStatusWithConfig(session);
      navigate(path, { state });
    } catch {
      setErr("Nie udało się wczytać konfiguracji zbierania dla tego statusu.");
    } finally {
      setResolvingStatusId(null);
    }
  };

  const loading = loadState === "loading";

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
        {warehouseId == null ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-center text-sm font-bold uppercase tracking-widest text-amber-700 shadow-sm">
            Wybierz magazyn w pasku u góry
          </p>
        ) : null}

        {err ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-center text-sm font-bold text-red-800 shadow-sm">
            {err}
          </p>
        ) : null}

        {warehouseId != null && loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 size={40} className="animate-spin mb-4 text-[#5a4fcf]" strokeWidth={2.5} />
            <p className="font-black uppercase tracking-widest text-[11px]">Ładowanie kolejek...</p>
          </div>
        ) : null}

        {warehouseId != null && loadState === "ready" && rows.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-100 bg-slate-50 text-slate-400 shadow-sm">
              <AlertTriangle size={32} strokeWidth={2.5} />
            </div>
            <p className="mb-2 text-lg font-bold text-slate-900">Brak skonfigurowanych statusów</p>
          </div>
        ) : null}

        {warehouseId != null && loadState === "ready" && rows.length > 0 ? (
          <ul
            className="grid w-full list-none grid-cols-1 gap-4 p-0 m-0 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Statusy skonfigurowane do zbierania"
          >
            {rows.map((r) => {
              const active = statusRowHasActiveSession(r);
              const badge = statusRowCartBadgeLabel(r);
              const needScanCta = statusRowShowScanCartCta(r);
              return (
                <li key={r.source_status_id} className="min-w-0">
                  <WmsFlowStatusTileButton
                    variant="work"
                    showRealizationCounts
                    statusName={r.status}
                    orderCount={r.order_count}
                    inProgressByOthers={r.in_progress_by_others ?? 0}
                    inProgressByMe={r.in_progress_by_me ?? 0}
                    color={r.color}
                    mainGroup={r.main_group as OrderUiMainGroup}
                    requireCart={r.require_cart}
                    cartType={r.cart_type}
                    activeCartLabel={badge}
                    hasActiveSession={active}
                    sessionProductsPicked={Math.max(0, Number(r.session_products_picked) || 0)}
                    sessionProductsTotal={Math.max(0, Number(r.session_products_total) || 0)}
                    showScanCartCta={needScanCta}
                    onScanCartClick={() => {
                      if (statusRowHasActiveSession(r) || !statusRowShowScanCartCta(r)) return;
                      setScanTargetStatusId(r.source_status_id);
                      setErr(
                        r.cart_type === "BASKETS"
                          ? "Zeskanuj wózek z koszykami dla tego statusu."
                          : "Zeskanuj wózek dla tego statusu.",
                      );
                      refocusScannerInput();
                    }}
                    disabled={warehouseId == null || resolvingStatusId != null || scanBusy}
                    loading={
                      resolvingStatusId === r.source_status_id ||
                      (scanBusy && scanTargetStatusId === r.source_status_id)
                    }
                    onClick={() => void resumeOrStart(r)}
                  />
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
