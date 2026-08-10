import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPickingConfiguredStatuses, getWmsPickingFlowConfig } from "../../api/wmsPickingEntryApi";
import { getWmsPickingResolveCart, postWmsPickingStart } from "../../api/wmsPickingProductsApi";
import { useWmsMessage } from "../../components/wms/WmsMessageProvider";
import { useWmsPickingCart } from "../../context/WmsPickingCartContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { playScanBeep } from "../../utils/playScanBeep";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsFlowStatusTileButton } from "./WmsFlowStatusTileButton";
import { resolveAfterStatusWithConfig, sessionWithPickingFlowConfig } from "./wmsPickingFlowResolve";
import { WMS_ROUTES } from "./wmsRoutes";
import { Loader2, AlertTriangle } from "lucide-react";

type StatusRow = Awaited<ReturnType<typeof getPickingConfiguredStatuses>>[number];

/** Aktywna praca operatora na tej karcie — SSOT z API, bez zgadywania typu wózka. */
function rowHasOperatorActiveSession(r: StatusRow): boolean {
  if (r.has_operator_active_session === true) return true;
  if (r.active_cart_id != null && r.active_cart_id > 0) return true;
  if (r.active_session_id != null && r.active_session_id > 0) return true;
  if ((r.in_progress_by_me ?? 0) > 0) return true;
  if ((r.session_products_total ?? 0) > 0) return true;
  return false;
}

function cartBadgeFromRow(r: StatusRow): string | null {
  if (!rowHasOperatorActiveSession(r)) return null;
  const name = (r.active_cart_name || "").trim();
  if (name) return name;
  const code = (r.active_cart_code || "").trim();
  if (code) return code;
  if (r.active_cart_id != null) return `CART-${r.active_cart_id}`;
  return null;
}

export default function WmsPickingStatusPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { setPickingCart } = useWmsPickingCart();
  const { showWmsError, showWmsMessage } = useWmsMessage();
  const {
    registerScanHandler,
    setScannerInputPlaceholder,
    refocusScannerInput,
    appendScanToHistory,
    showScanFeedbackFromCode,
  } = useWmsScanner();

  const [rows, setRows] = useState<StatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resolvingStatusId, setResolvingStatusId] = useState<number | null>(null);
  /** Tylko status BEZ aktywnej sesji — jawny start skanu. Nigdy fallback na inny typ. */
  const [scanTargetStatusId, setScanTargetStatusId] = useState<number | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const scanBusyRef = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await getPickingConfiguredStatuses(DAMAGE_TENANT_ID, warehouseId);
      setRows(data);
      for (const r of data) {
        if (!rowHasOperatorActiveSession(r) || r.active_cart_id == null) continue;
        const phys =
          r.active_cart_type === "BASKETS" ? "multi" : r.active_cart_type === "BULK" ? "bulk" : undefined;
        setPickingCart({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId,
          cartId: r.active_cart_id,
          cartCode: (r.active_cart_code || "").trim() || `CART-${r.active_cart_id}`,
          cartName: r.active_cart_name?.trim() || undefined,
          cartType: phys,
        });
        break;
      }
    } catch {
      setErr("Nie udało się wczytać statusów z konfiguracji zbierania.");
      setRows([]);
    } finally {
      setLoading(false);
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

  const assignCartFromScan = useCallback(
    async (rawCode: string, target: StatusRow) => {
      if (warehouseId == null || !target.require_cart || !target.cart_type) return;
      // Absolutny zakaz resolve-cart przy aktywnej sesji tej karty.
      if (rowHasOperatorActiveSession(target)) {
        setErr("Masz już aktywną sesję zbierania. Wejdź w kartę, zamiast skanować wózek ponownie.");
        setScanTargetStatusId(null);
        return;
      }
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
        showWmsError(e);
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
    ],
  );

  // Skaner TYLKO gdy jawnie wybrano status BEZ aktywnej sesji.
  // Nigdy nie fallbackuj na inny status (to powodowało expected_cart_type=BASKETS przy skanie CART).
  useEffect(() => {
    if (warehouseId == null || scanTargetStatusId == null) {
      registerScanHandler(null);
      setScannerInputPlaceholder("Wybierz status zbierania");
      return;
    }
    const target = rows.find((r) => r.source_status_id === scanTargetStatusId);
    if (!target || !target.require_cart || !target.cart_type || rowHasOperatorActiveSession(target)) {
      registerScanHandler(null);
      setScanTargetStatusId(null);
      setScannerInputPlaceholder("Wybierz status zbierania");
      return;
    }

    setScannerInputPlaceholder(
      target.cart_type === "BASKETS" ? "Zeskanuj wózek z koszykami" : "Zeskanuj wózek",
    );
    refocusScannerInput();

    const handler = (ean: string) => {
      const latest = rowsRef.current.find((r) => r.source_status_id === scanTargetStatusId);
      if (!latest || rowHasOperatorActiveSession(latest)) {
        setScanTargetStatusId(null);
        return;
      }
      void assignCartFromScan(ean, latest);
    };
    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [
    rows,
    warehouseId,
    scanTargetStatusId,
    assignCartFromScan,
    registerScanHandler,
    setScannerInputPlaceholder,
    refocusScannerInput,
  ]);

  const resumeOrStart = async (r: StatusRow) => {
    if (warehouseId == null || resolvingStatusId != null || scanBusy) return;

    const active = rowHasOperatorActiveSession(r);

    // BRAK sesji + require cart → tylko skan (bez resolve przez pomyłkę innego kafelka).
    if (r.require_cart && !active) {
      setScanTargetStatusId(r.source_status_id);
      setErr(
        r.cart_type === "BASKETS"
          ? "Zeskanuj wózek z koszykami dla tego statusu."
          : "Zeskanuj wózek dla tego statusu.",
      );
      refocusScannerInput();
      return;
    }

    const reused =
      active && r.active_cart_id != null
        ? {
            cartId: r.active_cart_id,
            cartCode: (r.active_cart_code || "").trim() || `CART-${r.active_cart_id}`,
            cartName: r.active_cart_name?.trim() || null,
            physicalCartType:
              r.active_cart_type === "BASKETS"
                ? "multi"
                : r.active_cart_type === "BULK"
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
        : ("all" as const);

    const resumeStatusId =
      r.session_source_status_id != null && r.session_source_status_id > 0
        ? r.session_source_status_id
        : r.source_status_id;

    // Typ wózka SESJI (nie kafelka) — przy wznowieniu.
    const sessionCartType =
      r.active_cart_type === "BASKETS" || r.active_cart_type === "BULK"
        ? r.active_cart_type
        : r.cart_type;

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
            pickingSessionId: r.active_session_id ?? null,
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

  const anyNeedsNewCartScan = useMemo(
    () => rows.some((r) => r.require_cart && !rowHasOperatorActiveSession(r)),
    [rows],
  );

  useEffect(() => {
    if (!anyNeedsNewCartScan && scanTargetStatusId != null) {
      setScanTargetStatusId(null);
    }
  }, [anyNeedsNewCartScan, scanTargetStatusId]);

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

        {warehouseId != null && !loading && !err && rows.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-100 bg-slate-50 text-slate-400 shadow-sm">
              <AlertTriangle size={32} strokeWidth={2.5} />
            </div>
            <p className="mb-2 text-lg font-bold text-slate-900">Brak skonfigurowanych statusów</p>
          </div>
        ) : null}

        {warehouseId != null && !loading && rows.length > 0 ? (
          <ul
            className="grid w-full list-none grid-cols-1 gap-4 p-0 m-0 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Statusy skonfigurowane do zbierania"
          >
            {rows.map((r) => {
              const active = rowHasOperatorActiveSession(r);
              const badge = cartBadgeFromRow(r);
              // CTA WYŁĄCZNIE gdy brak aktywnej sesji — nigdy równolegle z badge wózka.
              const needScanCta = r.require_cart && !active;
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
                    sessionProductsPicked={Math.max(0, Number(r.session_products_picked) || 0)}
                    sessionProductsTotal={Math.max(0, Number(r.session_products_total) || 0)}
                    showScanCartCta={needScanCta}
                    onScanCartClick={() => {
                      if (rowHasOperatorActiveSession(r)) return;
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
