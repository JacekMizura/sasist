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
  mergeActiveSessionIntoStatusRows,
  operatorHasActiveCartSession,
  scanMatchesAssignedCart,
  statusRowCartBadgeLabel,
  statusRowHasActiveSession,
  statusRowNeedsCartScanToStart,
  statusRowShowSessionProgress,
} from "./wmsPickingStatusSession";
import { WMS_ROUTES } from "./wmsRoutes";
import { Loader2, AlertTriangle } from "lucide-react";

type StatusRow = Awaited<ReturnType<typeof getPickingConfiguredStatuses>>[number];

type LoadState = "idle" | "loading" | "ready" | "error";

/**
 * Lista statusów zbierania.
 * Aktywna sesja (API) = SSOT dla badge, progresu, CTA i skanu wózka.
 * Skan własnego wózka → otwiera istniejącą sesję (products), nigdy resolve-cart.
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

  const syncCartFromActive = useCallback(
    (active: WmsPickingActiveSessionApi | null, data: StatusRow[]) => {
      if (warehouseId == null) return;
      if (active?.has_active_session && active.cart_id != null && active.cart_id > 0) {
        setPickingCart({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId,
          cartId: active.cart_id,
          cartCode: (active.cart_code || "").trim() || `CART-${active.cart_id}`,
          cartName: active.cart_name?.trim() || undefined,
          cartType:
            active.cart_type === "BASKETS" ? "multi" : active.cart_type === "BULK" ? "bulk" : undefined,
        });
        return;
      }
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
    },
    [warehouseId, setPickingCart],
  );

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
      const data = await getPickingConfiguredStatuses(DAMAGE_TENANT_ID, warehouseId);
      let active: WmsPickingActiveSessionApi | null = null;
      try {
        active = await getPickingActiveSession(DAMAGE_TENANT_ID, warehouseId);
      } catch {
        // Statusy mogą działać bez osobnego endpointu — sesja z wierszy.
        active = null;
      }
      setRows(mergeActiveSessionIntoStatusRows(data, active));
      setActiveSession(active);
      setLoadState("ready");
      syncCartFromActive(active, data);
    } catch {
      setErr("Nie udało się wczytać statusów z konfiguracji zbierania.");
      setRows([]);
      setActiveSession(null);
      setLoadState("error");
    }
  }, [warehouseId, syncCartFromActive]);

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

  /** Otwórz ISTNIEJĄCĄ sesję (klik karty / skan własnego wózka) — zero resolve-cart. */
  const openExistingSession = useCallback(
    async (r: StatusRow, activeOverride?: WmsPickingActiveSessionApi | null) => {
      if (warehouseId == null || resolvingStatusId != null || scanBusyRef.current) return;
      const active = activeOverride ?? activeSessionRef.current;

      const cartId = r.active_cart_id ?? active?.cart_id ?? null;
      const reused =
        cartId != null && cartId > 0
          ? {
              cartId,
              cartCode:
                (r.active_cart_code || active?.cart_code || "").trim() || `CART-${cartId}`,
              cartName: (r.active_cart_name || active?.cart_name || "").trim() || null,
              physicalCartType:
                (r.active_cart_type || active?.cart_type) === "BASKETS"
                  ? "multi"
                  : (r.active_cart_type || active?.cart_type) === "BULK"
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
          : active?.order_type === "single" ||
              active?.order_type === "multi" ||
              active?.order_type === "all"
            ? active.order_type
            : ("all" as const);

      // source_status_id z SESJI — nie z „klikniętej” karty gdy meta mówi inaczej.
      const resumeStatusId =
        r.session_source_status_id != null && r.session_source_status_id > 0
          ? r.session_source_status_id
          : active?.source_status_id != null && active.source_status_id > 0
            ? active.source_status_id
            : r.source_status_id;

      const sessionCartType =
        r.active_cart_type === "BASKETS" || r.active_cart_type === "BULK"
          ? r.active_cart_type
          : active?.cart_type === "BASKETS" || active?.cart_type === "BULK"
            ? active.cart_type
            : r.cart_type;

      const sessionId = r.active_session_id ?? active?.session_id ?? null;
      const picked =
        r.session_products_picked ?? active?.products_picked ?? 0;
      const total =
        r.session_products_total ?? active?.products_total ?? 0;

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
            zebrane: Math.max(0, Number(picked) || 0),
            doZebrania: Math.max(0, (Number(total) || 0) - (Number(picked) || 0)),
            wTrakcie: 0,
            braki: 0,
          },
        };
        const { path, state } = resolveAfterStatusWithConfig(session);
        playScanBeep();
        navigate(path, { state });
      } catch {
        setErr("Nie udało się otworzyć aktywnej sesji zbierania.");
      } finally {
        setResolvingStatusId(null);
      }
    },
    [warehouseId, resolvingStatusId, setPickingCart, navigate],
  );

  const startNewSessionFromScan = useCallback(
    async (rawCode: string, target: StatusRow) => {
      if (warehouseId == null || !target.require_cart || !target.cart_type) return SCAN_CONSUMED;
      if (statusRowHasActiveSession(target) || operatorHasActiveCartSession(activeSessionRef.current, rowsRef.current)) {
        const row = findActiveStatusRowForSession(rowsRef.current, activeSessionRef.current);
        if (row) void openExistingSession(row);
        setScanTargetStatusId(null);
        return SCAN_CONSUMED;
      }
      const code = normalizeScanEan(rawCode);
      if (!code || scanBusyRef.current) return SCAN_CONSUMED;
      scanBusyRef.current = true;
      setScanBusy(true);
      setErr(null);
      try {
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
        // 409 „już masz sesję z tym wózkiem” → otwórz istniejącą (nie pokazuj błędu resolve).
        const msg = String(
          (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail ?? "",
        );
        if (
          (e as { response?: { status?: number } })?.response?.status === 409 &&
          /aktywn/i.test(msg)
        ) {
          try {
            const latest = await getPickingActiveSession(DAMAGE_TENANT_ID, warehouseId);
            setActiveSession(latest);
            activeSessionRef.current = latest;
            const row = findActiveStatusRowForSession(rowsRef.current, latest);
            if (row && latest.has_active_session) {
              setScanTargetStatusId(null);
              void openExistingSession(row, latest);
              return SCAN_CONSUMED;
            }
          } catch {
            /* fall through */
          }
        }
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
      openExistingSession,
    ],
  );

  // Handler ZAWSZE aktywny na /wms/picking.
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
      !statusRowHasActiveSession(target) &&
      !operatorHasActiveCartSession(activeSession, rows);

    setScannerInputPlaceholder(
      waitingNewScan
        ? target!.cart_type === "BASKETS"
          ? "Zeskanuj wózek z koszykami"
          : "Zeskanuj wózek"
        : "Skan wózka otwiera sesję / wybierz status",
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
        cartId: active?.cart_id ?? activeRow?.active_cart_id ?? snap?.cartId ?? null,
      };
      const hasAssignedCart =
        (assigned.cartId != null && assigned.cartId > 0) ||
        Boolean((assigned.cartCode || "").trim()) ||
        (active?.has_active_session === true && active.has_cart);

      // 1) Mój aktywny wózek → OTWÓRZ sesję (nie toast, nie resolve-cart).
      if (hasAssignedCart && scanMatchesAssignedCart(code, assigned)) {
        appendScanToHistory(code);
        setScanTargetStatusId(null);
        setErr(null);
        const row =
          activeRow ??
          findActiveStatusRowForSession(latestRows, active) ??
          latestRows.find((x) => statusRowHasActiveSession(x));
        if (row) {
          void openExistingSession(row, active);
        } else {
          showScannerToast("Nie znaleziono aktywnej sesji dla tego wózka — odśwież listę.");
        }
        return SCAN_CONSUMED;
      }

      // 2) Inny wózek przy aktywnej sesji — nie przypisuj nowego.
      if (hasAssignedCart && looksLikePickingCartCode(code)) {
        appendScanToHistory(code);
        showScannerToast("Masz aktywną sesję. Zeskanuj swój wózek, aby do niej wrócić, albo anuluj zbieranie.");
        return SCAN_CONSUMED;
      }

      // 3) Start nowej sesji — jawny target ALBO jeden status wymagający skanu.
      const sid = scanTargetRef.current;
      let startTarget =
        sid != null ? latestRows.find((r) => r.source_status_id === sid) ?? null : null;
      if (
        !startTarget &&
        looksLikePickingCartCode(code) &&
        !operatorHasActiveCartSession(active, latestRows)
      ) {
        const needScan = latestRows.filter((r) =>
          statusRowNeedsCartScanToStart(r, { operatorHasActiveCartSession: false }),
        );
        if (needScan.length === 1) {
          startTarget = needScan[0] ?? null;
        }
      }
      if (
        startTarget &&
        statusRowNeedsCartScanToStart(startTarget, {
          operatorHasActiveCartSession: operatorHasActiveCartSession(active, latestRows),
        })
      ) {
        void startNewSessionFromScan(code, startTarget);
        return SCAN_CONSUMED;
      }
      if (sid != null) {
        setScanTargetStatusId(null);
      }

      if (looksLikePickingCartCode(code)) {
        appendScanToHistory(code);
        showScannerToast("Wybierz status (Wózki / Wózki z koszykami), a następnie zeskanuj wózek.");
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
    activeSession,
    scanTargetStatusId,
    registerScanHandler,
    setScannerInputPlaceholder,
    refocusScannerInput,
    startNewSessionFromScan,
    openExistingSession,
    appendScanToHistory,
    showScannerToast,
  ]);

  const resumeOrStart = async (r: StatusRow) => {
    if (warehouseId == null || resolvingStatusId != null || scanBusy) return;
    if (loadState === "loading") return;

    const active = statusRowHasActiveSession(r);
    const globalCart = operatorHasActiveCartSession(activeSession, rows);
    const thisIsGlobal =
      globalCart &&
      (activeSession?.source_status_id === r.source_status_id ||
        activeSession?.session_id === r.active_session_id ||
        (activeSession?.cart_id != null && activeSession.cart_id === r.active_cart_id) ||
        active);

    if (active || thisIsGlobal) {
      await openExistingSession(r);
      return;
    }

    // Start nowej sesji — skan (klik bez sesji). Bez czerwonego bannera.
    if (r.require_cart) {
      if (globalCart) {
        const own = findActiveStatusRowForSession(rows, activeSession);
        if (own) {
          await openExistingSession(own);
          return;
        }
      }
      setErr(null);
      setScanTargetStatusId(r.source_status_id);
      refocusScannerInput();
      return;
    }

    // Cartless / bez skanu — konfiguracja → dalszy flow.
    setResolvingStatusId(r.source_status_id);
    setErr(null);
    try {
      const cfg = await getWmsPickingFlowConfig(DAMAGE_TENANT_ID, warehouseId, r.source_status_id);
      const session = {
        ...sessionWithPickingFlowConfig(
          {
            orderUiStatusId: r.source_status_id,
            orderUiStatusName: r.status,
            orderUiStatusColor: r.color,
            mainGroup: r.main_group as OrderUiMainGroup,
          },
          cfg,
        ),
        hubOrderCount: Number(r.order_count) || 0,
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
  const hasGlobalCartSession = operatorHasActiveCartSession(activeSession, rows);
  const scanPromptTarget =
    scanTargetStatusId != null
      ? rows.find((r) => r.source_status_id === scanTargetStatusId) ?? null
      : null;
  const showCartScanPrompt =
    !hasGlobalCartSession &&
    scanPromptTarget != null &&
    scanPromptTarget.require_cart === true &&
    !statusRowHasActiveSession(scanPromptTarget);
  const cartScanPromptText =
    scanPromptTarget?.cart_type === "BASKETS"
      ? "Zeskanuj wózek z koszykami, aby rozpocząć zbieranie"
      : "Zeskanuj wózek, aby rozpocząć zbieranie";

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
        {warehouseId == null ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-center text-sm font-bold uppercase tracking-widest text-amber-700 shadow-sm">
            Wybierz magazyn w pasku u góry
          </p>
        ) : null}

        {err ? (
          <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-center text-sm font-bold text-red-800 shadow-sm">
            {err}
          </p>
        ) : null}

        {warehouseId != null && loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 size={40} className="animate-spin mb-4 text-[#5a4fcf]" strokeWidth={2.5} />
            <p className="font-black uppercase tracking-widest text-[11px]">Ładowanie kolejek...</p>
          </div>
        ) : null}

        {warehouseId != null && loadState === "error" && !err ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-center text-sm font-bold text-red-800 shadow-sm">
            Błąd ładowania statusów zbierania.
          </p>
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
          <>
            <ul
              className="grid w-full list-none grid-cols-1 gap-4 p-0 m-0 sm:grid-cols-2 lg:grid-cols-3"
              aria-label="Statusy skonfigurowane do zbierania"
            >
              {rows.map((r) => {
                const active = statusRowHasActiveSession(r);
                const badge = statusRowCartBadgeLabel(r);
                const showProgress = statusRowShowSessionProgress(r);
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
                      showSessionProgress={showProgress}
                      sessionProductsPicked={
                        showProgress ? Math.max(0, Number(r.session_products_picked) || 0) : 0
                      }
                      sessionProductsTotal={
                        showProgress ? Math.max(0, Number(r.session_products_total) || 0) : 0
                      }
                      showScanCartCta={false}
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

            {showCartScanPrompt ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
                <p className="max-w-md text-sm font-medium text-slate-600 sm:text-base">
                  {cartScanPromptText}
                </p>
                <button
                  type="button"
                  className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-[#e85d04] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#d45303] active:scale-[0.99]"
                  onClick={() => {
                    refocusScannerInput();
                  }}
                >
                  {scanPromptTarget?.cart_type === "BASKETS"
                    ? "Zeskanuj wózek z koszykami"
                    : "Zeskanuj wózek"}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
