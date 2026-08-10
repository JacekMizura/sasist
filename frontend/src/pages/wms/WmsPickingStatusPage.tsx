import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPickingConfiguredStatuses, getWmsPickingFlowConfig } from "../../api/wmsPickingEntryApi";
import {
  getWmsPickingProductLines,
  getWmsPickingResolveCart,
  postWmsPickingStart,
} from "../../api/wmsPickingProductsApi";
import { useWmsMessage } from "../../components/wms/WmsMessageProvider";
import { useWmsPickingCart } from "../../context/WmsPickingCartContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { playScanBeep } from "../../utils/playScanBeep";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsFlowStatusTileButton } from "./WmsFlowStatusTileButton";
import { cartTypeMatchesPickingTile } from "./wmsPickingCartTypeMatch";
import { resolveAfterStatusWithConfig, sessionWithPickingFlowConfig } from "./wmsPickingFlowResolve";
import { computeWmsPickingProductLineSessionStats, wmsPickingDisplayPickedQuantity } from "./wmsPickingUiGates";
import { Loader2, AlertTriangle } from "lucide-react";

/** Badge label: API (SSOT przypisania) → fallback snapshot skanu w tej sesji przeglądarki. */
function resolveStatusCartBadgeLabel(opts: {
  requireCart: boolean;
  tileCartType: "BULK" | "BASKETS" | null;
  apiName?: string | null;
  apiCode?: string | null;
  apiType?: "BULK" | "BASKETS" | null;
  snapshotName?: string | null;
  snapshotCode?: string | null;
  snapshotPhysicalType?: string | null;
}): string | null {
  if (!opts.requireCart) return null;
  const tile = opts.tileCartType;
  if (opts.apiCode || opts.apiName) {
    if (tile == null || opts.apiType == null || opts.apiType === tile) {
      const fromApi = (opts.apiName || opts.apiCode || "").trim();
      if (fromApi) return fromApi;
    }
  }
  if (tile != null && !cartTypeMatchesPickingTile(tile, opts.snapshotPhysicalType)) {
    return null;
  }
  const fromSnap = (opts.snapshotName || opts.snapshotCode || "").trim();
  return fromSnap || null;
}

export default function WmsPickingStatusPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { clearPickingCart, setPickingCart, snapshot } = useWmsPickingCart();
  const { showWmsError, showWmsMessage } = useWmsMessage();
  const {
    registerScanHandler,
    setScannerInputPlaceholder,
    refocusScannerInput,
    appendScanToHistory,
    showScanFeedbackFromCode,
  } = useWmsScanner();

  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPickingConfiguredStatuses>>>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resolvingStatusId, setResolvingStatusId] = useState<number | null>(null);
  const [scanTargetStatusId, setScanTargetStatusId] = useState<number | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const scanBusyRef = useRef(false);

  const sessionCart = useMemo(() => {
    if (warehouseId == null || snapshot == null) return null;
    if (snapshot.warehouseId !== warehouseId || snapshot.tenantId !== DAMAGE_TENANT_ID) return null;
    return snapshot;
  }, [snapshot, warehouseId]);

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
      // Hydrate snapshot z BE, gdy operator ma już wózek w cyklu.
      for (const r of data) {
        if (!r.require_cart || r.active_cart_id == null) continue;
        const phys =
          r.active_cart_type === "BASKETS" ? "multi" : r.active_cart_type === "BULK" ? "bulk" : undefined;
        if (r.cart_type && phys && !cartTypeMatchesPickingTile(r.cart_type, phys)) continue;
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
    async (rawCode: string, target: (typeof rows)[number]) => {
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
        setPickingCart({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId,
          cartId: r.cart_id,
          cartCode: cartCodeResolved,
          cartName,
          cartType: (r.cart_type || "").trim().toLowerCase() || undefined,
        });
        playScanBeep();
        appendScanToHistory(code);
        setScanTargetStatusId(null);
        await load();
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
      load,
    ],
  );

  // Skaner na ekranie statusów — tylko gdy brak aktywnej sesji/wózka.
  useEffect(() => {
    const needsScanTiles = rows.filter((r) => {
      if (!r.require_cart || !r.cart_type) return false;
      if (r.active_cart_id != null) return false;
      if (r.active_session_id != null && r.active_session_id > 0) return false;
      if ((r.in_progress_by_me ?? 0) > 0) return false;
      const label = resolveStatusCartBadgeLabel({
        requireCart: true,
        tileCartType: r.cart_type,
        apiName: r.active_cart_name,
        apiCode: r.active_cart_code,
        apiType: r.active_cart_type ?? null,
        snapshotName: sessionCart?.cartName,
        snapshotCode: sessionCart?.cartCode,
        snapshotPhysicalType: sessionCart?.cartType,
      });
      return !label;
    });

    if (warehouseId == null || needsScanTiles.length === 0) {
      registerScanHandler(null);
      setScannerInputPlaceholder("Wybierz status zbierania");
      return;
    }

    const target =
      scanTargetStatusId != null
        ? needsScanTiles.find((r) => r.source_status_id === scanTargetStatusId) ?? needsScanTiles[0]
        : needsScanTiles[0];

    setScannerInputPlaceholder(
      target.cart_type === "BASKETS" ? "Zeskanuj wózek z koszykami" : "Zeskanuj wózek",
    );
    refocusScannerInput();

    const handler = (ean: string) => {
      void assignCartFromScan(ean, target);
    };
    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [
    rows,
    warehouseId,
    sessionCart,
    scanTargetStatusId,
    assignCartFromScan,
    registerScanHandler,
    setScannerInputPlaceholder,
    refocusScannerInput,
  ]);

  const onChoose = async (r: (typeof rows)[number]) => {
    if (warehouseId == null || resolvingStatusId != null || scanBusy) return;

    const tileType = r.require_cart ? r.cart_type : null;
    const apiOk =
      r.require_cart &&
      r.active_cart_id != null &&
      (r.active_cart_type == null || tileType == null || r.active_cart_type === tileType);
    const snapOk =
      r.require_cart &&
      sessionCart != null &&
      cartTypeMatchesPickingTile(tileType, sessionCart.cartType);

    if (r.require_cart && !apiOk && !snapOk) {
      // Brak pasującego wózka — wyczyść niespasowany snapshot i ustaw target skanu.
      if (sessionCart && !cartTypeMatchesPickingTile(tileType, sessionCart.cartType)) {
        clearPickingCart();
      }
      setScanTargetStatusId(r.source_status_id);
      setErr(
        tileType === "BASKETS"
          ? "Zeskanuj wózek z koszykami dla tego statusu."
          : "Zeskanuj wózek dla tego statusu.",
      );
      refocusScannerInput();
      return;
    }

    // Nie kasuj pasującego wózka przy ponownym wejściu.
    if (r.require_cart && sessionCart && !cartTypeMatchesPickingTile(tileType, sessionCart.cartType)) {
      clearPickingCart();
    }

    const cartFromApi =
      apiOk && r.active_cart_id != null
        ? {
            cartId: r.active_cart_id,
            cartCode: (r.active_cart_code || "").trim() || `CART-${r.active_cart_id}`,
            cartName: r.active_cart_name?.trim() || null,
            physicalCartType:
              r.active_cart_type === "BASKETS"
                ? "multi"
                : r.active_cart_type === "BULK"
                  ? "bulk"
                  : sessionCart?.cartType ?? null,
          }
        : null;

    const cartFromSnap =
      snapOk && sessionCart
        ? {
            cartId: sessionCart.cartId,
            cartCode: sessionCart.cartCode,
            cartName: sessionCart.cartName ?? null,
            physicalCartType: sessionCart.cartType ?? null,
          }
        : null;

    const reused = cartFromApi ?? cartFromSnap;

    // Hydrate FE cart from API session — nie każ zgadywać wózka przy re-entry.
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

    const base = {
      orderUiStatusId: r.source_status_id,
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
            requireCart: true as const,
            cartType: tileType,
          }
        : {}),
    };
    setResolvingStatusId(r.source_status_id);
    setErr(null);
    try {
      const cfg = await getWmsPickingFlowConfig(DAMAGE_TENANT_ID, warehouseId, r.source_status_id);
      // Wolne zamówienia = order_count z kafelka; produkty = projekcja sesji z API (SSOT).
      const hubOrderCount = Number(r.order_count) || 0;
      let hubPickStats = {
        zebrane: Math.max(0, Number(r.session_products_picked) || 0),
        doZebrania: Math.max(
          0,
          (Number(r.session_products_total) || 0) - (Number(r.session_products_picked) || 0),
        ),
        wTrakcie: 0,
        braki: 0,
      };
      // Dociągnij szczegóły tylko gdy jest wózek sesji — ten sam build_wms_picking_product_lines.
      if (reused?.cartId != null) {
        const linesResult = await getWmsPickingProductLines(
          DAMAGE_TENANT_ID,
          warehouseId,
          r.source_status_id,
          "all",
          reused.cartId,
        ).catch(() => null);
        if (linesResult?.session_stats) {
          hubPickStats = {
            zebrane: linesResult.session_stats.zebrane ?? 0,
            doZebrania: linesResult.session_stats.do_zebrania ?? 0,
            wTrakcie: linesResult.session_stats.w_trakcie ?? 0,
            braki: linesResult.session_stats.braki_szt ?? linesResult.session_stats.braki ?? 0,
          };
        } else if (linesResult) {
          const normalized = (linesResult.products ?? []).map((row) => ({
            ...row,
            picked_quantity: wmsPickingDisplayPickedQuantity(row),
          }));
          const computed = computeWmsPickingProductLineSessionStats(normalized);
          hubPickStats = {
            zebrane: computed.zebrane,
            doZebrania: computed.doZebrania,
            wTrakcie: computed.wTrakcie,
            braki: computed.brakiSzt,
          };
        }
      }
      const session = sessionWithPickingFlowConfig(base, cfg);
      const enriched = { ...session, hubOrderCount, hubPickStats };
      const { path, state } = resolveAfterStatusWithConfig(enriched);
      navigate(path, { state });
    } catch {
      setErr("Nie udało się wczytać konfiguracji zbierania dla tego statusu.");
    } finally {
      setResolvingStatusId(null);
    }
  };

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
              const badge = resolveStatusCartBadgeLabel({
                requireCart: r.require_cart,
                tileCartType: r.cart_type,
                apiName: r.active_cart_name,
                apiCode: r.active_cart_code,
                apiType: r.active_cart_type ?? null,
                snapshotName: sessionCart?.cartName,
                snapshotCode: sessionCart?.cartCode,
                snapshotPhysicalType: sessionCart?.cartType,
              });
              const hasSessionCart =
                r.active_cart_id != null ||
                (r.active_session_id != null && r.active_session_id > 0) ||
                (r.in_progress_by_me ?? 0) > 0;
              // CTA tylko gdy trzeba rozpocząć przypisanie — nie gdy sesja już zna wózek.
              const needScanCta = r.require_cart && !hasSessionCart && !badge;
              const sessionPicked = Math.max(0, Number(r.session_products_picked) || 0);
              const sessionTotal = Math.max(0, Number(r.session_products_total) || 0);
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
                    sessionProductsPicked={sessionPicked}
                    sessionProductsTotal={sessionTotal}
                    showScanCartCta={needScanCta}
                    onScanCartClick={() => {
                      setScanTargetStatusId(r.source_status_id);
                      setErr(
                        r.cart_type === "BASKETS"
                          ? "Zeskanuj wózek z koszykami dla tego statusu."
                          : "Zeskanuj wózek dla tego statusu.",
                      );
                      refocusScannerInput();
                    }}
                    disabled={warehouseId == null || resolvingStatusId != null || scanBusy}
                    loading={resolvingStatusId === r.source_status_id || (scanBusy && scanTargetStatusId === r.source_status_id)}
                    onClick={() => void onChoose(r)}
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
