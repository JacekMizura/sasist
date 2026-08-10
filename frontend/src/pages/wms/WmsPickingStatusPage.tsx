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
import { Icon } from "../../components/ui/Icon";
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

function parseApiDetail(e: unknown): { code?: string; message: string; status?: number } {
  const ax = e as { response?: { status?: number; data?: { detail?: unknown } } };
  const status = ax.response?.status;
  const detail = ax.response?.data?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as { code?: string; message?: string };
    return {
      code: typeof d.code === "string" ? d.code : undefined,
      message: String(d.message || d.code || "Konflikt"),
      status,
    };
  }
  return { message: String(detail ?? ""), status };
}

/**
 * Lista statusów zbierania.
 * SSOT aktywnej sesji = wyłącznie GET /picking/active-session (backend).
 * Lokalny snapshot wózka NIE blokuje skanu wolnego wózka.
 */
export default function WmsPickingStatusPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { setPickingCart, clearPickingCart } = useWmsPickingCart();
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

  const applyActiveSession = useCallback(
    (active: WmsPickingActiveSessionApi | null, data: StatusRow[]) => {
      const merged = mergeActiveSessionIntoStatusRows(data, active);
      setRows(merged);
      setActiveSession(active);
      activeSessionRef.current = active;
      rowsRef.current = merged;
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
      } else {
        // Backend = brak sesji → nie trzymaj starego snapshotu FE.
        clearPickingCart();
      }
    },
    [warehouseId, setPickingCart, clearPickingCart],
  );

  const refreshActiveFromBackend = useCallback(async (): Promise<WmsPickingActiveSessionApi | null> => {
    if (warehouseId == null) return null;
    try {
      const active = await getPickingActiveSession(DAMAGE_TENANT_ID, warehouseId);
      applyActiveSession(active, rowsRef.current);
      return active;
    } catch {
      return activeSessionRef.current;
    }
  }, [warehouseId, applyActiveSession]);

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
        active = null;
      }
      applyActiveSession(active, data);
      setLoadState("ready");
    } catch {
      setErr("Nie udało się wczytać statusów z konfiguracji zbierania.");
      setRows([]);
      setActiveSession(null);
      setLoadState("error");
    }
  }, [warehouseId, applyActiveSession]);

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
      const picked = r.session_products_picked ?? active?.products_picked ?? 0;
      const total = r.session_products_total ?? active?.products_total ?? 0;

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
      if (warehouseId == null || !target.require_cart || !target.cart_type) return;
      const code = normalizeScanEan(rawCode);
      if (!code || scanBusyRef.current) return;
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
        const parsed = parseApiDetail(e);
        if (parsed.status === 409 && parsed.code === "ACTIVE_PICKING_SESSION") {
          const latest = await refreshActiveFromBackend();
          const row = findActiveStatusRowForSession(rowsRef.current, latest);
          if (row && latest?.has_active_session) {
            setScanTargetStatusId(null);
            await openExistingSession(row, latest);
            return;
          }
        }
        // Typ wózka / zajęty przez kogoś — pokaż realny komunikat z API.
        if (parsed.message) {
          showScannerToast(parsed.message);
        } else {
          showWmsError(e);
        }
        showScanFeedbackFromCode("INVALID_CART_SCAN");
        refocusScannerInput();
      } finally {
        scanBusyRef.current = false;
        setScanBusy(false);
      }
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
      refreshActiveFromBackend,
      showScannerToast,
    ],
  );

  /**
   * Skan wózka — ZAWSZE najpierw backend active-session.
   * Snapshot FE / rows nie decydują o „masz już sesję”.
   */
  const processCartScan = useCallback(
    async (rawCode: string) => {
      if (warehouseId == null || scanBusyRef.current) return;
      const code = normalizeScanEan(rawCode);
      if (!code) return;
      appendScanToHistory(code);

      scanBusyRef.current = true;
      setScanBusy(true);
      try {
        const latest = await refreshActiveFromBackend();
        const latestRows = rowsRef.current;

        if (latest?.has_active_session && latest.has_cart) {
          const assigned = {
            cartCode: latest.cart_code,
            cartName: latest.cart_name,
            cartId: latest.cart_id,
          };
          if (scanMatchesAssignedCart(code, assigned)) {
            const row = findActiveStatusRowForSession(latestRows, latest);
            if (row) {
              setScanTargetStatusId(null);
              await openExistingSession(row, latest);
              return;
            }
            showScannerToast("Nie znaleziono karty statusu dla aktywnej sesji — odśwież listę.");
            return;
          }
          const label = (latest.cart_name || latest.cart_code || `CART-${latest.cart_id}`).trim();
          showScannerToast(`Masz już aktywne zbieranie na wózku ${label}.`);
          return;
        }

        // Brak sesji w BE — wyczyść FE i startuj.
        clearPickingCart();

        const sid = scanTargetRef.current;
        let startTarget =
          sid != null ? latestRows.find((r) => r.source_status_id === sid) ?? null : null;
        if (!startTarget) {
          const needScan = latestRows.filter((r) => statusRowNeedsCartScanToStart(r));
          if (needScan.length === 1) startTarget = needScan[0] ?? null;
        }
        if (
          startTarget &&
          statusRowNeedsCartScanToStart(startTarget) &&
          startTarget.cart_type
        ) {
          // startNewSessionFromScan zarządza własnym scanBusy — zwolnij przed wywołaniem.
          scanBusyRef.current = false;
          setScanBusy(false);
          await startNewSessionFromScan(code, startTarget);
          return;
        }

        showScannerToast("Wybierz status (Wózki / Wózki z koszykami), a następnie zeskanuj wózek.");
        refocusScannerInput();
      } finally {
        scanBusyRef.current = false;
        setScanBusy(false);
      }
    },
    [
      warehouseId,
      appendScanToHistory,
      refreshActiveFromBackend,
      openExistingSession,
      showScannerToast,
      clearPickingCart,
      startNewSessionFromScan,
      refocusScannerInput,
    ],
  );

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
      if (looksLikePickingCartCode(code)) {
        void processCartScan(code);
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
    processCartScan,
    appendScanToHistory,
    showScannerToast,
  ]);

  const resumeOrStart = async (r: StatusRow) => {
    if (warehouseId == null || resolvingStatusId != null || scanBusy) return;
    if (loadState === "loading") return;

    // Zawsze weryfikuj sesję z backendu przed decyzją.
    const latest = await refreshActiveFromBackend();
    const latestRows = rowsRef.current;
    const active = statusRowHasActiveSession(
      latestRows.find((x) => x.source_status_id === r.source_status_id) ?? r,
    );
    const globalCart = operatorHasActiveCartSession(latest, latestRows);
    const thisIsGlobal =
      globalCart &&
      (latest?.source_status_id === r.source_status_id ||
        latest?.session_id === r.active_session_id ||
        (latest?.cart_id != null && latest.cart_id === r.active_cart_id) ||
        active);

    if (active || thisIsGlobal) {
      const row = findActiveStatusRowForSession(latestRows, latest) ?? r;
      await openExistingSession(row, latest);
      return;
    }

    if (r.require_cart) {
      if (globalCart) {
        const own = findActiveStatusRowForSession(latestRows, latest);
        if (own) {
          await openExistingSession(own, latest);
          return;
        }
      }
      setErr(null);
      setScanTargetStatusId(r.source_status_id);
      refocusScannerInput();
      return;
    }

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
  const isBasketsPrompt = scanPromptTarget?.cart_type === "BASKETS";

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
            <Loader2 size={40} className="mb-4 animate-spin text-[#5a4fcf]" strokeWidth={2.5} />
            <p className="text-[11px] font-black uppercase tracking-widest">Ładowanie kolejek...</p>
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
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
                  <Icon
                    name={isBasketsPrompt ? "basket" : "cart"}
                    size={28}
                    className="text-slate-400"
                    aria-hidden
                  />
                </div>
                <p className="text-base font-semibold tracking-tight text-slate-900">
                  Gotowe do rozpoczęcia
                </p>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
                  {isBasketsPrompt
                    ? "Zeskanuj wózek z koszykami, aby rozpocząć zbieranie zamówień."
                    : "Zeskanuj wózek, aby rozpocząć zbieranie zamówień."}
                </p>
                <button
                  type="button"
                  className="mt-6 inline-flex h-9 items-center justify-center rounded-lg bg-[#e85d04] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#d45303] active:scale-[0.99]"
                  onClick={() => refocusScannerInput()}
                >
                  {isBasketsPrompt ? "Zeskanuj wózek z koszykami" : "Zeskanuj wózek"}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
