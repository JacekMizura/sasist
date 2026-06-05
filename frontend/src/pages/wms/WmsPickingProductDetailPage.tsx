import axios from "axios";
import { Bell, Eye, Hand, PackageMinus, ShoppingCart, MapPin, AlertTriangle, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  formatFastApiErrorDetail,
  getWmsPickingProductDetail,
  postWmsPickingQuickPick,
  postWmsPickingReportShortage,
  type WmsPickingProductDetailApi,
  type WmsPickingProductLocationRowApi,
} from "../../api/wmsPickingProductsApi";
import { useAuth } from "../../context/AuthContext";
import { useMergedPickingSession, useWmsPickingCart } from "../../context/WmsPickingCartContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWarehouseExecution } from "../../context/WarehouseExecutionContext";
import { formatOperatorDisplayName } from "../../components/wms/execution/activeOperationContext";
import { executionContextFromPicking } from "../../components/wms/execution/pickingExecutionContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { playScanBeep } from "../../utils/playScanBeep";
import { dispatchWmsShortagesUpdated } from "../../utils/wmsRefresh";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { ShippingMethodLogo } from "../../components/shipping/ShippingMethodLogo";
import type { WmsPickingProductsNavState } from "./wmsPickingFlowTypes";
import { resolveWmsPickingTenantId } from "./wmsPickingTenant";
import { WMS_ROUTES } from "./wmsRoutes";
import {
  applyWmsPickingShortageToDetail,
  cannotReportPickingShortage,
  polishOrdersWithShortagesLabel,
  wmsPickingEffectivePickedQuantity,
  wmsPickingRemainingQty,
  wmsPickingShortageDefaultQty,
} from "./wmsPickingUiGates";
import { pageContainerWidthAlignClass } from "../../components/layout/PageContainer";

const BASKET_PUT_STYLE_RING: readonly string[] = [
  "border-violet-500 bg-violet-100/95 text-violet-950 ring-2 ring-violet-400/50",
  "border-sky-500 bg-sky-100/95 text-sky-950 ring-2 ring-sky-400/50",
  "border-emerald-500 bg-emerald-100/95 text-emerald-950 ring-2 ring-emerald-400/50",
  "border-amber-500 bg-amber-100/95 text-amber-950 ring-2 ring-amber-400/50",
  "border-rose-500 bg-rose-100/95 text-rose-950 ring-2 ring-rose-400/50",
  "border-indigo-500 bg-indigo-100/95 text-indigo-950 ring-2 ring-indigo-400/50",
  "border-teal-500 bg-teal-100/95 text-teal-950 ring-2 ring-teal-400/50",
  "border-fuchsia-500 bg-fuchsia-100/95 text-fuchsia-950 ring-2 ring-fuchsia-400/50",
];

function basketStyleIndexForLabel(label: string | null | undefined): number {
  const s = (label ?? "").trim();
  if (!s) return 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h) % BASKET_PUT_STYLE_RING.length;
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

function locStock(loc: { stock_quantity?: number }): number {
  const q = loc.stock_quantity;
  return typeof q === "number" && Number.isFinite(q) ? q : 0;
}

function locationMatchesScan(loc: WmsPickingProductLocationRowApi, scan: string): boolean {
  const b = normalizeScanEan(scan).toUpperCase();
  if (!b) return false;
  const code = normalizeScanEan(loc.location_code ?? "").toUpperCase();
  const idStr = String(loc.location_id);
  if (code && (b === code || b.endsWith(code) || code.endsWith(b))) return true;
  if (b === idStr.toUpperCase() || b.endsWith(idStr) || idStr.endsWith(b)) return true;
  return false;
}

function ModalShell({
  title,
  children,
  onClose,
  closeDisabled = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  const requestClose = () => {
    if (closeDisabled) return;
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wms-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="max-h-[min(92vh,720px)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <h2 id="wms-modal-title" className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={requestClose} disabled={closeDisabled} className="min-h-[44px] min-w-[44px] rounded-xl text-sm font-semibold text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-950 disabled:opacity-40">Zamknij</button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

export default function WmsPickingProductDetailPage() {
  const { productId: productIdParam } = useParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { user } = useAuth();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { setActiveContext } = useWarehouseExecution();
  const { snapshot: pickingCartSnapshot } = useWmsPickingCart();
  const pickingTenantId = useMemo(() => resolveWmsPickingTenantId(warehouseId, pickingCartSnapshot), [warehouseId, pickingCartSnapshot]);
  const { registerScanHandler, setScannerInputPlaceholder, appendScanToHistory, refocusScannerInput, showScannerToast } = useWmsScanner();

  const pickingSessionRaw = (routerLocation.state as WmsPickingProductsNavState | null)?.pickingSession ?? null;
  const pickingSession = useMergedPickingSession(pickingSessionRaw, pickingTenantId, warehouseId);
  const orderType = pickingSession?.orderTypeChoice ?? "all";
  const recoveryOrderId = pickingSession?.recoveryOrderId ?? null;
  const productId = Number(productIdParam);

  const [detail, setDetail] = useState<WmsPickingProductDetailApi | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pickQty, setPickQty] = useState(1);
  const [pickBusy, setPickBusy] = useState(false);
  const [pickMsg, setPickMsg] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<number | null>(null);
  const [locationHint, setLocationHint] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLocId, setManualLocId] = useState<number | null>(null);
  const [manualQty, setManualQty] = useState(1);
  const [taskOpen, setTaskOpen] = useState(false);
  const [shortageConfirmOpen, setShortageConfirmOpen] = useState(false);
  const [shortageBusy, setShortageBusy] = useState(false);
  const [shortageErr, setShortageErr] = useState<string | null>(null);
  const [shortageQtyInput, setShortageQtyInput] = useState(1);

  const detailLoadSeqRef = useRef(0);

  const fetchProductDetail = useCallback(async (): Promise<WmsPickingProductDetailApi | null> => {
    if (warehouseId == null || !pickingSession || !Number.isFinite(productId) || productId <= 0) return null;
    return getWmsPickingProductDetail(pickingTenantId, warehouseId, pickingSession.orderUiStatusId, orderType, productId, pickingSession.cartId, recoveryOrderId);
  }, [warehouseId, pickingSession, orderType, productId, pickingTenantId, recoveryOrderId]);

  const applyDetailToState = useCallback((d: WmsPickingProductDetailApi) => {
    setDetail(d);
    const rem = wmsPickingRemainingQty(d);
    setPickQty(rem > 0 ? rem : 0);
    setShortageQtyInput(wmsPickingShortageDefaultQty(d));
  }, []);

  const refreshDetailSilently = useCallback(async () => {
    try {
      const d = await fetchProductDetail();
      if (d) applyDetailToState(d);
    } catch {}
  }, [fetchProductDetail, applyDetailToState]);

  const load = useCallback(async (): Promise<WmsPickingProductDetailApi | null> => {
    if (warehouseId == null || !pickingSession || !Number.isFinite(productId) || productId <= 0) {
      setDetail(null);
      return null;
    }
    const seq = ++detailLoadSeqRef.current;
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchProductDetail();
      if (seq !== detailLoadSeqRef.current) return null;
      if (!d) {
        setErr("Nie udało się wczytać szczegółów produktu.");
        setDetail(null);
        return null;
      }
      applyDetailToState(d);
      return d;
    } catch {
      if (seq !== detailLoadSeqRef.current) return null;
      setErr("Nie udało się wczytać szczegółów produktu.");
      setDetail(null);
      return null;
    } finally {
      if (seq === detailLoadSeqRef.current) setLoading(false);
    }
  }, [warehouseId, pickingSession, productId, fetchProductDetail, applyDetailToState]);

  useEffect(() => {
    if (!pickingSessionRaw) {
      navigate(WMS_ROUTES.picking, { replace: true });
      return;
    }
    void load();
  }, [pickingSessionRaw, navigate, load]);

  useEffect(() => {
    if (!detail) return;
    setLocationHint(null);
    if (detail.locations.length === 1) {
      setActiveLocationId(detail.locations[0].location_id);
    } else {
      setActiveLocationId(null);
    }
  }, [detail]);

  const needsLocationScan = (detail?.locations.length ?? 0) > 1;
  const selectedLocation = useMemo(() => {
    if (!detail || activeLocationId == null) return undefined;
    return detail.locations.find((l) => l.location_id === activeLocationId);
  }, [detail, activeLocationId]);

  const missingTotal = useMemo(() => {
    if (!detail) return 0;
    const m = detail.missing_quantity;
    return typeof m === "number" && Number.isFinite(m) ? Math.max(0, m) : 0;
  }, [detail]);

  const displayPickedDetail = useMemo(() => {
    if (!detail) return 0;
    return wmsPickingEffectivePickedQuantity(detail);
  }, [detail]);

  const remaining = useMemo(() => {
    if (!detail) return 0;
    return wmsPickingRemainingQty(detail);
  }, [detail]);

  const toPickTotal = remaining;
  const pickQueueDone = detail != null && remaining <= 1e-9;

  const shortageLocationLabel = useMemo(() => {
    if (!detail?.locations?.length) return "—";
    const code = selectedLocation?.location_code ?? detail.locations[0]?.location_code;
    return (code && String(code).trim()) || "—";
  }, [detail, selectedLocation]);

  useEffect(() => {
    if (!pickingSession || !detail) {
      setActiveContext(null);
      return;
    }
    const source =
      selectedLocation?.location_code ??
      detail.locations[0]?.location_code ??
      shortageLocationLabel;
    setActiveContext(
      executionContextFromPicking({
        recoveryOrderId,
        orderNumber: recoveryOrderId != null ? String(recoveryOrderId) : null,
        cartCode: pickingSession.cartCode,
        cartName: pickingSession.cartName,
        sourceLocation: source !== "—" ? source : null,
        remainingQty: remaining,
        currentStep:
          needsLocationScan && activeLocationId == null
            ? "Skanuj lokalizację źródłową"
            : `Zbierz: ${detail.name}`,
        operatorName: formatOperatorDisplayName(user),
        scanHint:
          needsLocationScan && activeLocationId == null
            ? "Najpierw potwierdź lokalizację skanem"
            : "Skanuj EAN produktu",
      }),
    );
    return () => setActiveContext(null);
  }, [
    activeLocationId,
    detail,
    needsLocationScan,
    pickingSession,
    recoveryOrderId,
    remaining,
    selectedLocation?.location_code,
    setActiveContext,
    shortageLocationLabel,
    user,
  ]);

  const fullyPickedNoMissing = pickQueueDone && missingTotal <= 1e-9;

  const reportShortageBlocked = useMemo(() => cannotReportPickingShortage({ remaining, cartId: pickingSession?.cartId }), [remaining, pickingSession?.cartId]);
  const ordersWithShortageCount = useMemo(() => {
    if (!detail?.orders?.length) return 0;
    return detail.orders.filter((o) => (o.missing_quantity ?? 0) > 1e-9).length;
  }, [detail]);

  useEffect(() => {
    if (!detail) return;
    if (needsLocationScan && activeLocationId == null) {
      setScannerInputPlaceholder("Zeskanuj lokalizację");
    } else {
      setScannerInputPlaceholder("Skanuj kod lokalizacji lub EAN");
    }
    refocusScannerInput();
  }, [detail, needsLocationScan, activeLocationId, setScannerInputPlaceholder, refocusScannerInput]);

  // LOGIKA ODZNACZANIA KOLEJNYCH SZTUK W DETALU POPRZEZ FIZYCZNY SKAN
  useEffect(() => {
    if (!detail || !pickingSession) {
      registerScanHandler(null);
      return;
    }
    const handler = (raw: string) => {
      const scan = normalizeScanEan(raw);
      if (!scan) return;
      const locs = detail.locations;
      if (locs.length === 0) return;

      // Obsługa skanowania lokalizacji
      if (locs.length > 1) {
        const hit = locs.find((loc) => locationMatchesScan(loc, scan));
        if (hit) {
          playScanBeep();
          appendScanToHistory(scan);
          setActiveLocationId(hit.location_id);
          setLocationHint(null);
          return;
        }
      }

      // Skan kodu EAN produktu wewnątrz detalu - podbija sztukę
      if (normalizeScanEan(detail.ean) === scan && !pickQueueDone && selectedLocation) {
        void confirm_pick(1, selectedLocation.location_id);
        return;
      }
    };
    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [detail, pickingSession, activeLocationId, registerScanHandler, appendScanToHistory, pickQueueDone, selectedLocation]);

  const goBackToList = useCallback(
    (refreshList = false) => {
      if (!pickingSession) return;
      const state: WmsPickingProductsNavState = refreshList
        ? { pickingSession, pickingListRefreshAt: Date.now() }
        : { pickingSession };
      const rid = pickingSession.recoveryOrderId;
      if (rid != null && rid > 0) {
        navigate(WMS_ROUTES.pickingRecovery(rid), { state });
        return;
      }
      navigate(WMS_ROUTES.pickingProducts, { state });
    },
    [navigate, pickingSession],
  );

  async function confirm_pick(qty: number, locationId: number) {
    if (!pickingSession || warehouseId == null || !detail || qty <= 0 || remaining <= 0) return;
    const cartId = pickingSession.cartId;
    if (cartId == null || !Number.isFinite(cartId) || cartId < 1) {
      setPickMsg("Brak aktywnego wózka (cart_id).");
      return;
    }
    setPickBusy(true);
    setPickMsg(null);
    try {
      await postWmsPickingQuickPick(pickingTenantId, warehouseId, pickingSession.orderUiStatusId, orderType, {
        product_id: productId,
        location_id: locationId,
        quantity: Math.min(qty, remaining),
        cart_id: cartId,
        ...(recoveryOrderId != null && recoveryOrderId > 0 ? { recovery_order_id: recoveryOrderId } : {}),
      });
      playScanBeep();
      const nextRem = remaining - Math.min(qty, remaining);
      if (nextRem <= 1e-9) {
        goBackToList(true);
      } else {
        await load();
        setManualOpen(false);
        setManualLocId(null);
      }
    } catch (e: unknown) {
      let msg = "Zapis nie powiódł się.";
      if (axios.isAxiosError(e)) {
        const data = e.response?.data;
        const d = data as { detail?: unknown; error?: string } | undefined;
        if (d?.detail != null) msg = formatFastApiErrorDetail({ detail: d.detail });
        else if (d?.error) msg = String(d.error);
      }
      setPickMsg(msg);
    } finally {
      setPickBusy(false);
    }
  }

  const pickBlockedByLocation = needsLocationScan && activeLocationId == null;
  const openPreview = () => {
    if (!pickingSession) return;
    navigate(WMS_ROUTES.productPreview(productId), {
      state: { pickingSession, orderType, returnPath: routerLocation.pathname, returnState: { pickingSession } satisfies WmsPickingProductsNavState },
    });
  };

  const openManual = () => {
    if (!detail || detail.locations.length === 0) return;
    setManualLocId(detail.locations.length === 1 ? detail.locations[0].location_id : activeLocationId);
    const rem = wmsPickingRemainingQty(detail);
    setManualQty(rem > 0 ? Math.min(rem, 1) : 0);
    setManualOpen(true);
  };

  const openShortageModal = useCallback(() => {
    if (!detail || reportShortageBlocked) return;
    setShortageQtyInput(wmsPickingShortageDefaultQty(detail));
    setShortageErr(null);
    console.info("[shortage.modal] OPEN", { product_id: productId, line_id: productId });
    window.requestAnimationFrame(() => setShortageConfirmOpen(true));
  }, [detail, reportShortageBlocked, productId]);

  useEffect(() => {
    if (shortageConfirmOpen || manualOpen) return;
    refocusScannerInput();
  }, [shortageConfirmOpen, manualOpen, refocusScannerInput]);

  const submitShortage = async () => {
    if (shortageBusy) return;
    if (!pickingSession || warehouseId == null || !detail || reportShortageBlocked || shortageQtyInput <= 0) {
      console.warn("[shortage.modal] SUBMIT skipped", {
        blocked: reportShortageBlocked,
        qty: shortageQtyInput,
        has_detail: Boolean(detail),
      });
      return;
    }
    const fifoOrder =
      detail.orders.find((o) => o.order_id === detail.active_fifo_order_id) ?? detail.orders[0] ?? null;
    const lineId = fifoOrder?.order_item_id ?? null;
    console.info("[shortage.modal] SUBMIT", {
      payload: {
        product_id: productId,
        missing_qty: shortageQtyInput,
        cart_id: pickingSession.cartId,
        order_item_id: lineId,
      },
      line_id: lineId,
      qty: shortageQtyInput,
    });
    setShortageBusy(true);
    setShortageErr(null);
    try {
      await postWmsPickingReportShortage(pickingTenantId, warehouseId, pickingSession.orderUiStatusId, orderType, {
        product_id: productId,
        location_id: selectedLocation?.location_id ?? activeLocationId ?? null,
        missing_qty: shortageQtyInput,
        cart_id: pickingSession.cartId!,
        order_ids: detail.orders.map((o) => o.order_id),
        ...(recoveryOrderId != null && recoveryOrderId > 0 ? { recovery_order_id: recoveryOrderId } : {}),
        ...(lineId != null && lineId > 0 ? { order_item_id: lineId } : {}),
      });
      console.info("[shortage.modal] API_OK", { line_id: lineId, qty: shortageQtyInput });
      const optimistic = applyWmsPickingShortageToDetail(detail, shortageQtyInput);
      applyDetailToState(optimistic);
      dispatchWmsShortagesUpdated();
      playScanBeep();
      setShortageConfirmOpen(false);
      showScannerToast("Brak zapisany. Kontynuuj zbieranie.");
      void refreshDetailSilently();
      refocusScannerInput();
    } catch (e: unknown) {
      console.error("[shortage.modal] API_ERROR", e);
      setShortageErr("Zgłoszenie braku nie powiodło się.");
    } finally {
      setShortageBusy(false);
    }
  };

  if (warehouseId == null || !pickingSession) return <div className="p-6 text-center text-sm font-medium text-slate-500">Przekierowanie…</div>;

  return (
    <div className="min-h-screen w-full p-4 sm:p-6 lg:p-8 flex flex-col gap-6 bg-slate-50/50 font-sans text-slate-900 select-none">
      
      {/* NAGŁÓWEK AKCJI POWROTU */}
      <div className="flex items-center justify-between px-1">
        <button type="button" onClick={goBackToList} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm hover:bg-slate-50 transition-all active:scale-95">
          ← Wróć do listy produktów
        </button>
        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100/40">
          Ekran szczegółowy (Detal)
        </span>
      </div>

      {loading && !detail && <div className="py-24 text-center text-sm text-slate-500">Ładowanie produktu…</div>}

      {detail && (
        <div className="w-full bg-white border border-slate-200 rounded-[2.5rem] p-6 sm:p-10 shadow-sm flex flex-col gap-8">
          
          {/* SEKCJA GŁÓWNA PRODUKTU (Wizualne wyrównanie) */}
          <div className="flex flex-col md:flex-row items-center gap-8 border-b border-slate-100 pb-8">
            <div className="w-32 h-32 flex items-center justify-center bg-transparent shrink-0">
              {detail.image_url ? (
                <img src={detail.image_url} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
              ) : (
                <div className="text-xs font-bold text-slate-300">Brak zdjęcia</div>
              )}
            </div>
            <div className="text-center md:text-left flex-1 min-w-0">
              <p className="text-xl font-black text-slate-900 tracking-tight mb-1">EAN: <span className="font-mono">{detail.ean ?? "—"}</span></p>
              <h3 className="text-sm font-semibold text-slate-400 mb-4 leading-tight">{detail.name}</h3>
              
              {detail.put_to_basket_label && (
                <div className={`w-fit px-5 py-3 rounded-2xl border-2 font-black uppercase tracking-wider text-sm ${BASKET_PUT_STYLE_RING[(detail.put_to_basket_color_index ?? 0) % BASKET_PUT_STYLE_RING.length]}`}>
                  Odłóż do koszyka: {detail.put_to_basket_label}
                </div>
              )}
            </div>
          </div>

          {/* POTĘŻNY WIDGET POZOSTAŁYCH SZTUK DO ZEBRANIA */}
          <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-200/60 rounded-3xl text-center">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Postęp pobierania pozycji</p>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-6xl sm:text-7xl font-black text-[#5a4fcf] tabular-nums">{displayPickedDetail}</span>
              <span className="text-2xl font-bold text-slate-300">/</span>
              <span className="text-3xl font-black text-slate-500 tabular-nums">{fmtQty(detail.total_quantity)}</span>
              <span className="text-sm font-bold text-slate-400 ml-1">szt.</span>
            </div>

            {pickQueueDone ? (
              <div className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-wider text-xs shadow-lg shadow-emerald-500/10">
                <Check size={14} strokeWidth={3} /> Skompletowano pozycję
              </div>
            ) : (
              <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl">
                Zeskanuj kod EAN produktu, aby dodać kolejną sztukę
              </div>
            )}
          </div>

          {/* LOKALIZACJE ALOKACYJNE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-100 rounded-2xl p-5 bg-slate-50/40">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Lokalizacje półek</h4>
              <ul className="space-y-2">
                {detail.locations.map((loc) => (
                  <li key={loc.location_id} className={`flex items-center justify-between p-3 rounded-xl border bg-white ${activeLocationId === loc.location_id ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
                    <span className="font-mono font-bold text-slate-900">{loc.location_code}</span>
                    <span className="text-xs font-bold text-slate-500">Stan: {fmtQty(locStock(loc))} szt.</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* ZAMÓWIENIA POWIĄZANE */}
            <div className="border border-slate-100 rounded-2xl p-5 bg-slate-50/40">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Zamówienia i koszyki</h4>
              <ul className="space-y-2">
                {detail.orders.map((o, idx) => (
                  <li key={idx} className="p-3 bg-white rounded-xl border border-slate-200 flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-900">#{o.order_number}</span>
                    {o.basket_slot && <span className="font-black text-[#5a4fcf] bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg">Koszyk: {o.basket_slot}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* PASEK DOLNYCH NARZĘDZI SYSTEMOWYCH */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 p-4 backdrop-blur-sm shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <button type="button" onClick={openManual} disabled={pickQueueDone} className="px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors active:scale-95 disabled:opacity-40">Ręczny wpis</button>
            <button type="button" onClick={openShortageModal} disabled={reportShortageBlocked} className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors active:scale-95 disabled:opacity-40">Zgłoś brak</button>
          </div>
          
          <button type="button" onClick={goBackToList} className="px-6 py-3.5 bg-[#5a4fcf] hover:bg-[#4a40b2] text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95">
            Zatwierdź i wróć
          </button>
        </div>
      </div>

      {/* MODAL WPISU RĘCZNEGO */}
      {manualOpen && detail && (
        <ModalShell title="Zbierz produkt" onClose={() => setManualOpen(false)}>
          <label className="block mb-4">
            <span className="text-xs font-semibold text-slate-600">Podaj zebraną ilość (szt.)</span>
            <input type="number" min={0} step={0.01} max={remaining} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-semibold outline-none" value={manualQty || ""} onChange={(e) => setManualQty(Number(e.target.value))} />
          </label>
          <button type="button" onClick={() => { if (manualLocId != null) void confirm_pick(manualQty, manualLocId); }} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold uppercase tracking-wider">Potwierdź pobranie</button>
        </ModalShell>
      )}

      {/* MODAL POTWIERDZENIA BRAKU */}
      {shortageConfirmOpen && detail && (
        <ModalShell
          title="Zgłosić brak produktu?"
          onClose={() => {
            if (!shortageBusy) setShortageConfirmOpen(false);
          }}
          closeDisabled={shortageBusy}
        >
          <p className="text-sm text-slate-600 mb-4">Czy na pewno chcesz oznaczyć tę pozycję jako brak w magazynie?</p>
          {shortageErr ? <p className="mb-3 text-sm font-semibold text-red-700">{shortageErr}</p> : null}
          <button
            type="button"
            disabled={shortageBusy || shortageQtyInput <= 0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void submitShortage();
            }}
            className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-50"
          >
            {shortageBusy ? "Zapisywanie…" : "Zgłoś brak produktu"}
          </button>
        </ModalShell>
      )}
    </div>
  );
}