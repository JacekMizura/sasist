import axios from "axios";
import { Bell, Eye, Hand, PackageMinus, ShoppingCart, MapPin, AlertTriangle, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  formatFastApiErrorDetail,
  getWmsPickingProductDetail,
  postWmsPickingConfirmEmptyLocation,
  postWmsPickingQuickPick,
  postWmsPickingReportShortage,
  postWmsPickingUndoPick,
  type WmsPickingProductDetailApi,
  type WmsPickingProductLocationRowApi,
} from "../../api/wmsPickingProductsApi";
import { postStageConsolidationItem } from "../../api/wmsConsolidationApi";
import { useMergedPickingSession, useWmsPickingCart } from "../../context/WmsPickingCartContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { BundlePickingOrderTree } from "../../components/wms/picking/BundlePickingOrderTree";
import { BundlePickingScanCard } from "../../components/wms/bundle/BundlePickingScanCard";
import { BundleConsolidationRackCard } from "../../components/wms/bundle/BundleConsolidationRackCard";
import type { BundleScanOut, ConsolidationRackBundleRowOut } from "../../api/bundlesLogisticsApi";
import { getConsolidationRackBundleView } from "../../api/bundlesLogisticsApi";
import { tryPickingBundleScan } from "../../services/bundleScannerIntegration";
import { buildPickingBundleDisplay } from "../../utils/bundleScanFlow";
import { WmsOperationalPageBody, WmsOperationalPageShell } from "../../components/wms/execution/WmsOperationalPageShell";
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
  wmsPickingLineResolutionStatus,
  wmsPickingRemainingQty,
  wmsPickingShortageDefaultQty,
} from "./wmsPickingUiGates";
import { pageContainerWidthAlignClass } from "../../components/layout/PageContainer";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";

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
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
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
  /** empty_location | qty_mismatch | product_shortage */
  const [shortageProblemKind, setShortageProblemKind] = useState<"empty_location" | "qty_mismatch" | "product_shortage">(
    "product_shortage",
  );
  const [undoBusy, setUndoBusy] = useState(false);
  const [depositBusy, setDepositBusy] = useState(false);
  const [bundlePickScan, setBundlePickScan] = useState<BundleScanOut | null>(null);
  const [consolidationRackRows, setConsolidationRackRows] = useState<ConsolidationRackBundleRowOut[]>([]);

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
  const resolutionStatus = useMemo(
    () => (detail ? wmsPickingLineResolutionStatus(detail) : "ACTIVE"),
    [detail],
  );
  const isShortageResolved = resolutionStatus === "SHORTAGE";

  const shortageLocationLabel = useMemo(() => {
    if (!detail?.locations?.length) return "—";
    const code = selectedLocation?.location_code ?? detail.locations[0]?.location_code;
    return (code && String(code).trim()) || "—";
  }, [detail, selectedLocation]);

  const fullyPickedNoMissing = pickQueueDone && missingTotal <= 1e-9;

  const reportShortageBlocked = useMemo(
    () =>
      cannotReportPickingShortage({
        remaining,
        cartId: pickingSession?.cartId,
        pickedQuantity: displayPickedDetail,
      }),
    [remaining, pickingSession?.cartId, displayPickedDetail],
  );
  const canUndoPick = Boolean(pickingSession?.cartId) && displayPickedDetail > 1e-9 && missingTotal <= 1e-9;
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
      void (async () => {
      const scan = normalizeScanEan(raw);
      if (!scan) return;
      const locs = detail.locations;
      if (locs.length === 0) return;

      const shelfLabel = (detail.consolidation_shelf_label ?? "").trim();
      if (detail.consolidation_active && shelfLabel && scan.toUpperCase() === normalizeScanEan(shelfLabel).toUpperCase()) {
        const oid = detail.active_fifo_order_id ?? detail.orders?.[0]?.order_id;
        if (oid != null && oid > 0) {
          try {
            const rows = await getConsolidationRackBundleView(oid, shelfLabel);
            setConsolidationRackRows(rows);
            playScanBeep();
            appendScanToHistory(scan);
            showScannerToast(shelfLabel);
          } catch {
            showScannerToast("Nie udało się wczytać widoku RK.");
          }
        }
        return;
      }

      if (pickingSession.cartId != null && pickingSession.cartId > 0) {
        try {
          const locId = selectedLocation?.location_id ?? locs[0]?.location_id ?? null;
          const bundle = await tryPickingBundleScan({
            tenantId: pickingTenantId,
            barcode: scan,
            cartId: pickingSession.cartId,
            sourceStatusId: pickingSession.orderUiStatusId,
            orderType,
            locationId: locId,
          });
          if (bundle.handled) {
            playScanBeep();
            appendScanToHistory(scan);
            if (bundle.scan) setBundlePickScan(bundle.scan);
            if (bundle.toast) showScannerToast(bundle.toast);
            if (bundle.refresh) await load();
            return;
          }
        } catch {
          /* product scan fallback */
        }
      }

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
      })();
    };
    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [detail, pickingSession, activeLocationId, registerScanHandler, appendScanToHistory, pickQueueDone, selectedLocation, pickingTenantId, orderType, showScannerToast, load]);

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
        if (detail?.consolidation_active) {
          await load();
        } else {
          goBackToList(true);
        }
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

  async function confirmShelfDeposit() {
    if (
      !detail?.consolidation_plan_id ||
      !detail.consolidation_plan_item_id ||
      !detail.pending_shelf_deposit
    ) {
      return;
    }
    setDepositBusy(true);
    setPickMsg(null);
    try {
      await postStageConsolidationItem(
        detail.consolidation_plan_id,
        detail.consolidation_plan_item_id,
        pickingTenantId ?? DAMAGE_TENANT_ID,
      );
      playScanBeep();
      goBackToList(true);
    } catch (e: unknown) {
      let msg = "Potwierdzenie odłożenia nie powiodło się.";
      if (axios.isAxiosError(e)) {
        const data = e.response?.data;
        const d = data as { detail?: unknown; error?: string } | undefined;
        if (d?.detail != null) msg = formatFastApiErrorDetail({ detail: d.detail });
        else if (d?.error) msg = String(d.error);
      }
      setPickMsg(msg);
    } finally {
      setDepositBusy(false);
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
    const rem = wmsPickingRemainingQty(detail);
    const picked = wmsPickingEffectivePickedQuantity(detail);
    // Po completed: domyślnie konwertuj zebrane szt. na brak
    setShortageQtyInput(rem > 1e-9 ? wmsPickingShortageDefaultQty(detail) : Math.max(picked, 1));
    setShortageProblemKind(picked > 1e-9 && rem <= 1e-9 ? "empty_location" : "product_shortage");
    setShortageErr(null);
    window.requestAnimationFrame(() => setShortageConfirmOpen(true));
  }, [detail, reportShortageBlocked]);

  const submitUndoPick = async () => {
    if (undoBusy || !pickingSession?.cartId || warehouseId == null || !detail || !canUndoPick) return;
    setUndoBusy(true);
    setPickMsg(null);
    try {
      await postWmsPickingUndoPick(pickingTenantId, warehouseId, pickingSession.orderUiStatusId, orderType, {
        product_id: productId,
        cart_id: pickingSession.cartId,
        quantity: 1,
        location_id: selectedLocation?.location_id ?? activeLocationId ?? null,
        order_ids: detail.orders.map((o) => o.order_id),
        ...(recoveryOrderId != null && recoveryOrderId > 0 ? { recovery_order_id: recoveryOrderId } : {}),
      });
      playScanBeep();
      showScannerToast("Cofnięto pobranie 1 szt.");
      await load();
      refocusScannerInput();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: unknown } };
      showScannerToast(formatFastApiErrorDetail(ax.response?.data) || "Cofnięcie nie powiodło się.");
    } finally {
      setUndoBusy(false);
    }
  };

  useEffect(() => {
    if (shortageConfirmOpen || manualOpen) return;
    refocusScannerInput();
  }, [shortageConfirmOpen, manualOpen, refocusScannerInput]);

  const submitShortage = async () => {
    if (shortageBusy) return;
    if (!pickingSession || warehouseId == null || !detail || reportShortageBlocked || shortageQtyInput <= 0) {
      return;
    }
    const fifoOrder =
      detail.orders.find((o) => o.order_id === detail.active_fifo_order_id) ?? detail.orders[0] ?? null;
    const lineId = fifoOrder?.order_item_id ?? null;
    const locId = selectedLocation?.location_id ?? activeLocationId ?? detail.locations[0]?.location_id ?? null;
    setShortageBusy(true);
    setShortageErr(null);
    try {
      if (shortageProblemKind === "empty_location") {
        if (locId == null) {
          setShortageErr("Wybierz lokalizację, aby potwierdzić pustkę.");
          return;
        }
        const observed = locStock(selectedLocation ?? detail.locations[0]);
        const emptyRes = await postWmsPickingConfirmEmptyLocation(
          pickingTenantId,
          warehouseId,
          pickingSession.orderUiStatusId,
          orderType,
          {
            product_id: productId,
            location_id: locId,
            cart_id: pickingSession.cartId!,
            observed_stock_qty: observed,
            order_ids: detail.orders.map((o) => o.order_id),
            ...(recoveryOrderId != null && recoveryOrderId > 0 ? { recovery_order_id: recoveryOrderId } : {}),
          },
        );
        playScanBeep();
        setShortageConfirmOpen(false);
        const alt = emptyRes.alternate_locations?.[0];
        if (emptyRes.stock_effect === "pending_document_correction") {
          showScannerToast(
            alt
              ? `Pusta lokalizacja zgłoszona (korekta dokumentowa). Alternatywa: ${alt.location_code}`
              : "Pusta lokalizacja zgłoszona — zablokowana do zbierania do korekty dokumentowej.",
          );
          if (alt) setActiveLocationId(alt.location_id);
        } else if (alt) {
          showScannerToast(`Lokalizacja wyzerowana. Alternatywa: ${alt.location_code}`);
          setActiveLocationId(alt.location_id);
        } else {
          showScannerToast(
            emptyRes.shortage_kind === "PRODUCT_SHORTAGE"
              ? "Brak stocku na innych lokalizacjach — zgłoszono brak produktu."
              : "Potwierdzono pustą lokalizację.",
          );
        }
        dispatchWmsShortagesUpdated();
        await load();
        refocusScannerInput();
        return;
      }

      await postWmsPickingReportShortage(pickingTenantId, warehouseId, pickingSession.orderUiStatusId, orderType, {
        product_id: productId,
        location_id: locId,
        missing_qty: shortageQtyInput,
        cart_id: pickingSession.cartId!,
        order_ids: detail.orders.map((o) => o.order_id),
        problem_kind: shortageProblemKind === "qty_mismatch" ? "qty_mismatch" : "product_shortage",
        ...(recoveryOrderId != null && recoveryOrderId > 0 ? { recovery_order_id: recoveryOrderId } : {}),
        ...(lineId != null && lineId > 0 ? { order_item_id: lineId } : {}),
      });
      const optimistic = applyWmsPickingShortageToDetail(detail, shortageQtyInput);
      applyDetailToState(optimistic);
      dispatchWmsShortagesUpdated();
      playScanBeep();
      setShortageConfirmOpen(false);
      showScannerToast(
        shortageProblemKind === "qty_mismatch"
          ? "Zgłoszono rozbieżność ilości — bez zerowania lokalizacji."
          : "Brak zapisany. Kontynuuj zbieranie.",
      );
      const nextRem = wmsPickingRemainingQty(optimistic);
      if (nextRem <= 1e-9) {
        goBackToList(true);
        return;
      }
      void refreshDetailSilently();
      refocusScannerInput();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: unknown } };
      setShortageErr(formatFastApiErrorDetail(ax.response?.data) || "Zgłoszenie braku nie powiodło się.");
    } finally {
      setShortageBusy(false);
    }
  };

  if (warehouseId == null || !pickingSession) return <div className="p-6 text-center text-sm font-medium text-slate-500">Przekierowanie…</div>;

  return (
    <WmsOperationalPageShell className="bg-slate-50/50 font-sans text-slate-900 select-none">
      <WmsOperationalPageBody className="flex flex-col gap-6 !py-3 md:!py-4">
      <div className="flex items-center justify-between px-1">
        <button type="button" onClick={() => goBackToList(true)} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm hover:bg-slate-50 transition-all active:scale-95">
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
              {detail.consolidation_active ? (
                <span className="mb-3 inline-flex rounded-lg border border-violet-300 bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-violet-800">
                  Konsolidacja
                </span>
              ) : null}
              <p className="text-xl font-black text-slate-900 tracking-tight mb-1">EAN: <span className="font-mono">{detail.ean ?? "—"}</span></p>
              <h3 className="text-sm font-semibold text-slate-400 mb-4 leading-tight">{detail.name}</h3>
              
              {detail.consolidation_active && detail.consolidation_shelf_label ? (
                <div className="w-fit px-5 py-3 rounded-2xl border-2 border-violet-500 bg-violet-100/95 font-black uppercase tracking-wider text-sm text-violet-950 ring-2 ring-violet-400/50">
                  Odłóż na: {detail.consolidation_shelf_label}
                </div>
              ) : detail.put_to_basket_label ? (
                <div className={`w-fit px-5 py-3 rounded-2xl border-2 font-black uppercase tracking-wider text-sm ${BASKET_PUT_STYLE_RING[(detail.put_to_basket_color_index ?? 0) % BASKET_PUT_STYLE_RING.length]}`}>
                  Odłóż do koszyka: {detail.put_to_basket_label}
                </div>
              ) : null}
            </div>
          </div>

          {/* POTĘŻNY WIDGET POZOSTAŁYCH SZTUK DO ZEBRANIA */}
          <div
            className={`flex flex-col items-center justify-center p-8 border rounded-3xl text-center ${
              isShortageResolved
                ? "bg-amber-50 border-amber-200"
                : "bg-slate-50 border-slate-200/60"
            }`}
          >
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
              {isShortageResolved ? "Stan pozycji po zgłoszeniu braku" : "Postęp pobierania pozycji"}
            </p>
            {isShortageResolved ? (
              <div className="w-full max-w-md space-y-4">
                <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl border border-amber-300 bg-amber-100 text-amber-950 text-xs font-black uppercase tracking-wider">
                  <AlertTriangle size={16} strokeWidth={2.5} className="text-amber-700" />
                  Zgłoszono brak
                </div>
                <dl className="grid grid-cols-3 gap-3 text-left">
                  <div className="rounded-xl border border-amber-200/80 bg-white px-3 py-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Zapotrzebowanie</dt>
                    <dd className="mt-1 text-2xl font-black tabular-nums text-slate-900">{fmtQty(detail.total_quantity)}</dd>
                  </div>
                  <div className="rounded-xl border border-amber-200/80 bg-white px-3 py-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Zebrano</dt>
                    <dd className="mt-1 text-2xl font-black tabular-nums text-slate-900">{fmtQty(displayPickedDetail)}</dd>
                  </div>
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Brak</dt>
                    <dd className="mt-1 text-2xl font-black tabular-nums text-amber-900">{fmtQty(missingTotal)}</dd>
                  </div>
                </dl>
                <p className="text-sm font-semibold text-amber-900/80">
                  {detail.locations.length > 0
                    ? `Brak potwierdzony na: ${shortageLocationLabel}`
                    : "Brak dostępnego towaru / lokalizacji kompletacyjnej."}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-6xl sm:text-7xl font-black text-[#5a4fcf] tabular-nums">{displayPickedDetail}</span>
                  <span className="text-2xl font-bold text-slate-300">/</span>
                  <span className="text-3xl font-black text-slate-500 tabular-nums">{fmtQty(detail.total_quantity)}</span>
                  <span className="text-sm font-bold text-slate-400 ml-1">szt.</span>
                </div>

                {pickQueueDone ? (
                  detail.pending_shelf_deposit ? (
                    <button
                      type="button"
                      disabled={depositBusy}
                      onClick={() => void confirmShelfDeposit()}
                      className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-2xl font-black uppercase tracking-wider text-xs shadow-lg shadow-violet-500/10 disabled:opacity-50"
                    >
                      <Check size={14} strokeWidth={3} />
                      Odłożono na półkę {detail.consolidation_shelf_label ?? ""}
                    </button>
                  ) : (
                    <div className="flex flex-col items-center gap-3 w-full max-w-md">
                      <div className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-wider text-xs shadow-lg shadow-emerald-500/10">
                        <Check size={14} strokeWidth={3} /> Skompletowano pozycję
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          disabled={undoBusy || !canUndoPick}
                          onClick={() => void submitUndoPick()}
                          className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-[11px] font-bold uppercase tracking-wider hover:bg-slate-50 disabled:opacity-40"
                        >
                          {undoBusy ? "Cofanie…" : "Cofnij pobranie"}
                        </button>
                        <button
                          type="button"
                          disabled={reportShortageBlocked}
                          onClick={openShortageModal}
                          className="px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-[11px] font-bold uppercase tracking-wider hover:bg-amber-100 disabled:opacity-40"
                        >
                          Zgłoś problem / brak
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl">
                    Zeskanuj kod EAN produktu, aby dodać kolejną sztukę
                  </div>
                )}
              </>
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

            {/* KONTEKST BUNDLE + ZAMÓWIENIA */}
            <div className="md:col-span-2 border border-slate-100 rounded-2xl p-5 bg-slate-50/40">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Kontekst zestawów</h4>
              {detail.order_bundle_trees && detail.order_bundle_trees.length > 0 ? (
                <BundlePickingOrderTree trees={detail.order_bundle_trees} />
              ) : (
                <ul className="space-y-2">
                  {detail.orders.map((o, idx) => (
                    <li key={idx} className="p-3 bg-white rounded-xl border border-slate-200 flex flex-wrap justify-between items-center gap-2 text-xs">
                      <span className="font-bold text-slate-900">#{o.order_number}</span>
                      {o.bundle_name ? (
                        <span className="font-semibold text-indigo-700">
                          {o.bundle_name}
                          {o.is_bundle_component && o.bundle_component_index != null && o.bundle_component_count != null
                            ? ` (${o.bundle_component_index}/${o.bundle_component_count})`
                            : null}
                        </span>
                      ) : null}
                      {o.basket_slot ? (
                        <span className="font-black text-[#5a4fcf] bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg">
                          Koszyk: {o.basket_slot}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {(() => {
                const bundleDisplay = bundlePickScan ? buildPickingBundleDisplay(bundlePickScan) : null;
                return bundleDisplay ? <BundlePickingScanCard display={bundleDisplay} className="mt-4" /> : null;
              })()}
              {consolidationRackRows.length > 0 ? (
                <BundleConsolidationRackCard
                  rows={consolidationRackRows}
                  shelfLabel={detail.consolidation_shelf_label}
                  className="mt-4"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* PASEK DOLNYCH NARZĘDZI SYSTEMOWYCH */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 p-4 backdrop-blur-sm shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <button type="button" onClick={openManual} disabled={pickQueueDone || isShortageResolved} className="px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors active:scale-95 disabled:opacity-40">Ręczny wpis</button>
            {canUndoPick ? (
              <button
                type="button"
                disabled={undoBusy}
                onClick={() => void submitUndoPick()}
                className="px-4 py-3 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors active:scale-95 disabled:opacity-40"
              >
                {undoBusy ? "Cofanie…" : "Cofnij pobranie"}
              </button>
            ) : null}
            <button type="button" onClick={openShortageModal} disabled={reportShortageBlocked || isShortageResolved} className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors active:scale-95 disabled:opacity-40">Zgłoś brak</button>
          </div>
          
          <button type="button" onClick={() => goBackToList(true)} className="px-6 py-3.5 bg-[#5a4fcf] hover:bg-[#4a40b2] text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95">
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

      {/* MODAL POTWIERDZENIA BRAKU / ROZBIEŻNOŚCI */}
      {shortageConfirmOpen && detail && (
        <ModalShell
          title="Zgłoś problem / brak"
          onClose={() => {
            if (!shortageBusy) setShortageConfirmOpen(false);
          }}
          closeDisabled={shortageBusy}
        >
          <p className="text-sm text-slate-600 mb-3">
            Lokalizacja: <span className="font-mono font-bold text-slate-900">{shortageLocationLabel}</span>
          </p>
          <div className="space-y-2 mb-4">
            <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer ${shortageProblemKind === "empty_location" ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`}>
              <input
                type="radio"
                name="shortageKind"
                checked={shortageProblemKind === "empty_location"}
                onChange={() => setShortageProblemKind("empty_location")}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-bold text-slate-900">Lokalizacja jest pusta</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Potwierdzam, że na lokalizacji {shortageLocationLabel} nie ma tego produktu. Stan systemu zostanie wyzerowany.
                </span>
              </span>
            </label>
            <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer ${shortageProblemKind === "qty_mismatch" ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`}>
              <input
                type="radio"
                name="shortageKind"
                checked={shortageProblemKind === "qty_mismatch"}
                onChange={() => setShortageProblemKind("qty_mismatch")}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-bold text-slate-900">Nie znalazłem wymaganej ilości / stan niezgodny</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Zapisze brak w zbieraniu bez automatycznego zerowania całej lokalizacji.
                </span>
              </span>
            </label>
            <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer ${shortageProblemKind === "product_shortage" ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`}>
              <input
                type="radio"
                name="shortageKind"
                checked={shortageProblemKind === "product_shortage"}
                onChange={() => setShortageProblemKind("product_shortage")}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-bold text-slate-900">Brak produktu (bez korekty stocku lokalizacji)</span>
                <span className="block text-xs text-slate-500 mt-0.5">Klasyczne zgłoszenie braku na zamówieniu.</span>
              </span>
            </label>
          </div>
          {shortageProblemKind !== "empty_location" ? (
            <label className="block mb-4">
              <span className="text-xs font-semibold text-slate-600">Ilość braku (szt.)</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-semibold outline-none"
                value={shortageQtyInput || ""}
                onChange={(e) => setShortageQtyInput(Number(e.target.value))}
              />
            </label>
          ) : null}
          {shortageErr ? <p className="mb-3 text-sm font-semibold text-red-700">{shortageErr}</p> : null}
          <button
            type="button"
            disabled={shortageBusy || (shortageProblemKind !== "empty_location" && shortageQtyInput <= 0)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void submitShortage();
            }}
            className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-50"
          >
            {shortageBusy
              ? "Zapisywanie…"
              : shortageProblemKind === "empty_location"
                ? "Potwierdź pustą lokalizację"
                : "Zgłoś brak produktu"}
          </button>
        </ModalShell>
      )}
      </WmsOperationalPageBody>
    </WmsOperationalPageShell>
  );
}