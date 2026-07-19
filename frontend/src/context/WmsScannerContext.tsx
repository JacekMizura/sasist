import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { playScanBeep, playScanErrorBeep } from "../utils/playScanBeep";
import { WmsScanFeedbackOverlay } from "../wms/scanFeedback/WmsScanFeedbackOverlay";
import {
  mapWmsScanErrorCode,
  type WmsScanFeedback,
} from "../wms/scanFeedback/wmsScanErrorCatalog";
import {
  type DevScanHistoryEntry,
  loadDevScannerHistory,
  saveDevScannerHistory,
  scanKindToHistoryKind,
} from "../utils/devScannerStorage";
import { classifyWmsScanCode } from "../utils/wmsScanClassify";
import { normalizeScanEan } from "../utils/wmsScanNormalize";
import {
  isWmsPickingProductsScanPath,
  type WmsScanHandler,
} from "../utils/wmsScanDispatch";
import { multiScanTrace } from "../utils/multiPickingScanRoute";
import { dispatchScannerHelperWorkflowScan } from "../utils/scannerHelperDispatch";

export type { DevScanHistoryEntry, DevScannerFavorite } from "../utils/devScannerStorage";
import { DAMAGE_TENANT_ID } from "../pages/damage/damageShared";
import { resolveWmsPreviewScanToProductId } from "../pages/wms/wmsResolveProductScan";
import { WMS_ROUTES } from "../pages/wms/wmsRoutes";
import { useWarehouse } from "./WarehouseContext";

/**
 * Floating scanner emulator (drawer) — always on under WMS layout unless
 * ``VITE_ENABLE_DEV_SCANNER=false``. Manual scans call the same ``handleScan`` as pages.
 */
export const SHOW_WMS_DEV_SCANNER =
  String(import.meta.env.VITE_ENABLE_DEV_SCANNER ?? "true").toLowerCase() !== "false";

/**
 * Keyboard wedge (HID) buffer on window — only in Vite DEV or when explicitly enabled.
 * Avoids eating keystrokes on production operator terminals.
 */
export const ENABLE_WMS_KEYBOARD_WEDGE =
  import.meta.env.DEV || String(import.meta.env.VITE_ENABLE_DEV_SCANNER ?? "").toLowerCase() === "true";

/** Persist / show last N scans in the emulator. */
export const DEV_SCANNER_HISTORY_CAP = 20;
/** How many history rows the panel shows (flat list + per-category). */
export const DEV_SCANNER_HISTORY_UI = 20;

export type DevScanHistoryAppendMeta = Partial<
  Omit<DevScanHistoryEntry, "code" | "scannedAt">
>;
export type WmsScannerMode =
  | "idle"
  | "receiving"
  | "receiving-count"
  | "picking"
  | "product_preview"
  | "putaway"
  | "packing"
  | "returns"
  | "operational"
  | "operational-relocation"
  | "other";

export type WmsActiveDocument =
  | { kind: "pz"; pzId: number; tenantId: number; label?: string }
  | { kind: "picking"; label?: string }
  | { kind: "putaway"; label?: string }
  | { kind: "custom"; label: string; meta?: Record<string, unknown> };

export function isWmsProductPreviewPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/wms/product-preview" || /^\/wms\/product-preview\/\d+$/.test(p);
}

export function deriveWmsScannerMode(pathname: string): WmsScannerMode {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (/^\/wms\/receiving\/\d+$/.test(p) || /^\/wms\/receiving\/pz\/\d+$/.test(p)) return "receiving-count";
  if (p === "/wms/receiving") return "receiving";
  if (isWmsProductPreviewPath(p)) return "product_preview";
  if (
    p === "/wms/picking" ||
    p === "/wms/picking/order-type" ||
    p === "/wms/picking/cart" ||
    p === "/wms/picking/locations" ||
    p === "/wms/picking/products" ||
    /^\/wms\/picking\/products\/\d+$/.test(p) ||
    p === "/wms/picking/bundle-bulk-scan" ||
    /^\/wms\/picking\/recovery\/\d+$/.test(p)
  )
    return "picking";
  if (
    p === "/wms/putaway" ||
    /^\/wms\/putaway\/\d+$/.test(p) ||
    /^\/wms\/putaway\/\d+\/item\/\d+$/.test(p) ||
    /^\/wms\/putaway\/\d+\/item\/\d+\/execute$/.test(p)
  )
    return "putaway";
  if (
    p === "/wms/packing" ||
    p === "/wms/packing/mode" ||
    p === "/wms/packing/scan-cart" ||
    p === "/wms/packing/orders" ||
    /^\/wms\/packing\/order\/\d+$/.test(p)
  )
    return "packing";
  if (p.startsWith("/wms/returns")) return "returns";
  if (/^\/wms\/operational-queues\/relocation\/\d+$/.test(p)) return "operational-relocation";
  if (p.startsWith("/wms/operational-queues")) return "operational";
  if (p.startsWith("/wms")) return "other";
  return "idle";
}

/** Human-readable active scan consumer for the emulator footer. */
export function deriveActiveScanReceiverLabel(
  pathname: string,
  hasScanHandler: boolean,
  mode: WmsScannerMode,
): string {
  const p = pathname.replace(/\/+$/, "") || "/";
  const builtInPreview = isWmsProductPreviewPath(p);
  if (!hasScanHandler && !builtInPreview) {
    return "Brak aktywnego odbiorcy";
  }
  if (p === "/wms/picking/cart" || p === "/wms/packing/scan-cart") {
    return "Skanowanie wózków";
  }
  if (
    p === "/wms/picking/locations" ||
    /^\/wms\/putaway\/\d+\/item\/\d+\/execute$/.test(p) ||
    p === "/wms/mm" ||
    p.startsWith("/wms/mm/") ||
    mode === "operational-relocation"
  ) {
    return "Lokacje";
  }
  if (mode === "packing") return "Pakowanie";
  if (mode === "picking") return "Zbieranie";
  if (builtInPreview || mode === "product_preview") return "Podgląd produktu";
  if (mode === "receiving-count" || mode === "receiving") return "Przyjęcie";
  if (mode === "putaway") return "Lokacje";
  if (mode === "returns") return "Zwroty";
  if (mode === "operational") return "Kolejki operacyjne";
  if (hasScanHandler) return "Aktywny ekran WMS";
  return "Brak aktywnego odbiorcy";
}

type ScanHandler = WmsScanHandler;

export type WmsScannerContextValue = {
  /** Dispatches to the scan handler registered by the active WMS page. */
  handleScan: (raw: string) => void;
  mode: WmsScannerMode;
  /** Polish label of who currently consumes scans (emulator footer). */
  activeScanReceiverLabel: string;
  /** True when a page registered ``registerScanHandler``. */
  hasActiveScanHandler: boolean;
  /**
   * When true, Scanner Helper must not fire products/search / returns lookup
   * from the scan input (picking workflow owns the code).
   */
  suppressScannerHelperLookups: boolean;
  activeDocument: WmsActiveDocument | null;
  setActiveDocument: (doc: WmsActiveDocument | null) => void;
  registerScanHandler: (handler: ScanHandler | null) => void;
  appendScanToHistory: (ean: string, meta?: DevScanHistoryAppendMeta) => void;
  showScannerToast: (message: string) => void;
  /** Czerwony baner błędu (~2,5 s) — np. zły typ skanu na pakowaniu. */
  showScannerError: (message: string) => void;
  /** Structured operator feedback (code → catalog). Prefer this for MULTI picking. */
  showScanFeedback: (feedback: WmsScanFeedback) => void;
  showScanFeedbackFromCode: (
    code: string,
    opts?: { backendMessage?: string | null; contextHint?: string | null },
  ) => void;
  clearScannerToast: () => void;
  clearScanFeedback: () => void;
  scanFeedback: WmsScanFeedback | null;
  devEanInput: string;
  setDevEanInput: (v: string) => void;
  clearDevScannerInput: () => void;
  refocusScannerInput: () => void;
  scannerInputRef: React.RefObject<HTMLInputElement | null>;
  scannerInputDisabled: boolean;
  setScannerInputDisabled: (disabled: boolean) => void;
  scannerInputPlaceholder: string;
  setScannerInputPlaceholder: (placeholder: string) => void;
  scannerToast: string | null;
  scannerError: string | null;
  devScanHistory: DevScanHistoryEntry[];
};

const WmsScannerContext = createContext<WmsScannerContextValue | null>(null);

export function WmsScannerProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const mode = useMemo(() => deriveWmsScannerMode(location.pathname), [location.pathname]);

  const [activeDocument, setActiveDocumentState] = useState<WmsActiveDocument | null>(null);
  const [devScanHistory, setDevScanHistory] = useState<DevScanHistoryEntry[]>(() =>
    loadDevScannerHistory(DEV_SCANNER_HISTORY_CAP),
  );
  const [devEanInput, setDevEanInput] = useState("");
  const [scannerToast, setScannerToast] = useState<string | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<WmsScanFeedback | null>(null);
  const [scannerInputDisabled, setScannerInputDisabled] = useState(false);
  const [scannerInputPlaceholder, setScannerInputPlaceholder] = useState("Wpisz lub wklej EAN (↑↓ historia)");
  const [hasActiveScanHandler, setHasActiveScanHandler] = useState(false);

  const scanHandlerRef = useRef<ScanHandler | null>(null);
  const scannerInputRef = useRef<HTMLInputElement | null>(null);
  const previewScanBusyRef = useRef(false);
  const dispatchBusyRef = useRef(false);

  const suppressScannerHelperLookups = useMemo(
    () => hasActiveScanHandler && isWmsPickingProductsScanPath(location.pathname),
    [hasActiveScanHandler, location.pathname],
  );

  const activeScanReceiverLabel = useMemo(
    () => deriveActiveScanReceiverLabel(location.pathname, hasActiveScanHandler, mode),
    [location.pathname, hasActiveScanHandler, mode],
  );

  useEffect(() => {
    if (!SHOW_WMS_DEV_SCANNER) return;
    saveDevScannerHistory(devScanHistory, DEV_SCANNER_HISTORY_CAP);
  }, [devScanHistory]);

  useEffect(() => {
    if (!scannerToast) return;
    const t = window.setTimeout(() => setScannerToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [scannerToast]);

  useEffect(() => {
    if (!scannerError) return;
    const t = window.setTimeout(() => setScannerError(null), 2800);
    return () => window.clearTimeout(t);
  }, [scannerError]);

  useEffect(() => {
    if (!scanFeedback) return;
    const ms =
      scanFeedback.severity === "success" || scanFeedback.severity === "info" ? 3500 : 5500;
    const t = window.setTimeout(() => setScanFeedback(null), ms);
    return () => window.clearTimeout(t);
  }, [scanFeedback]);

  const registerScanHandler = useCallback((handler: ScanHandler | null) => {
    scanHandlerRef.current = handler;
    setHasActiveScanHandler(handler != null);
  }, []);

  const clearScanFeedback = useCallback(() => setScanFeedback(null), []);

  const showScanFeedback = useCallback((feedback: WmsScanFeedback) => {
    setScannerToast(null);
    setScannerError(null);
    setScanFeedback(feedback);
    if (feedback.severity === "error" || feedback.severity === "warning") {
      playScanErrorBeep();
    } else if (feedback.severity === "success") {
      playScanBeep();
    }
  }, []);

  const showScanFeedbackFromCode = useCallback(
    (code: string, opts?: { backendMessage?: string | null; contextHint?: string | null }) => {
      showScanFeedback(mapWmsScanErrorCode(code, opts));
    },
    [showScanFeedback],
  );

  const appendScanToHistory = useCallback((ean: string, meta?: DevScanHistoryAppendMeta) => {
    const key = normalizeScanEan(ean);
    if (!key) return;
    setDevScanHistory((prev) => {
      const kind = meta?.kind ?? scanKindToHistoryKind(classifyWmsScanCode(key));
      const entry: DevScanHistoryEntry = {
        code: key,
        kind,
        scannedAt: Date.now(),
        ...meta,
      };
      const withoutDup = prev.filter((e) => e.code !== key);
      return [entry, ...withoutDup].slice(0, DEV_SCANNER_HISTORY_CAP);
    });
  }, []);

  const showScannerToast = useCallback((message: string) => {
    setScannerError(null);
    setScanFeedback(null);
    setScannerToast(message);
  }, []);

  const showScannerError = useCallback((message: string) => {
    setScannerToast(null);
    setScanFeedback(
      mapWmsScanErrorCode("UNKNOWN_SCAN_CODE", { backendMessage: message }),
    );
    playScanErrorBeep();
  }, []);

  const clearScannerToast = useCallback(() => {
    setScannerToast(null);
    setScannerError(null);
    setScanFeedback(null);
  }, []);

  const clearDevScannerInput = useCallback(() => setDevEanInput(""), []);

  const refocusScannerInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      const el = scannerInputRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  const handleScan = useCallback(
    (raw: string) => {
      const ean = normalizeScanEan(raw);
      if (!ean) return;

      multiScanTrace("GLOBAL_SCAN_RECEIVED", {
        raw_code: ean,
        path: location.pathname,
        has_handler: Boolean(scanHandlerRef.current),
        picking_products_path: isWmsPickingProductsScanPath(location.pathname),
      });

      if (isWmsProductPreviewPath(location.pathname)) {
        const kind = classifyWmsScanCode(ean);
        multiScanTrace("PRODUCT_CLASSIFIED", {
          raw_code: ean,
          kind,
          via: "product_preview",
        });
        if (kind === "cart_like" || kind === "basket_like" || kind === "location_like") {
          showScannerToast("W podglądzie produktu zeskanuj kod EAN produktu.");
          appendScanToHistory(ean);
          refocusScannerInput();
          return;
        }
        if (previewScanBusyRef.current) return;
        previewScanBusyRef.current = true;
        void (async () => {
          try {
            const wid = warehouse?.id ?? null;
            if (wid == null) {
              showScannerToast("Wybierz magazyn.");
              return;
            }
            const r = await resolveWmsPreviewScanToProductId(DAMAGE_TENANT_ID, ean);
            if (!r.ok) {
              if (r.reason === "ambiguous") showScannerToast("Wiele wyników — użyj dokładnego EAN");
              else showScannerToast("Brak produktu");
              return;
            }
            const m = location.pathname.match(/^\/wms\/product-preview\/(\d+)$/);
            const currentPid = m ? Number(m[1]) : NaN;
            if (Number.isFinite(currentPid) && currentPid === r.productId) {
              showScannerToast("Ten sam produkt");
              return;
            }
            playScanBeep();
            appendScanToHistory(ean);
            const replace = /^\/wms\/product-preview\/\d+$/.test(location.pathname);
            navigate(WMS_ROUTES.productPreview(r.productId), {
              replace,
              state: location.state ?? { returnPath: WMS_ROUTES.productPreviewRoot },
            });
          } catch {
            showScannerToast("Błąd wyszukiwania produktu.");
          } finally {
            previewScanBusyRef.current = false;
            refocusScannerInput();
          }
        })();
        return;
      }

      const fn = scanHandlerRef.current;
      if (!fn) {
        multiScanTrace("GLOBAL_SCAN_NO_HANDLER", { raw_code: ean, path: location.pathname });
        showScannerToast("Ta strona nie obsługuje jeszcze skanera.");
        return;
      }
      if (dispatchBusyRef.current) {
        multiScanTrace("GLOBAL_SCAN_BUSY", { raw_code: ean, consumed: true });
        return;
      }
      dispatchBusyRef.current = true;
      void (async () => {
        try {
          const dispatched = await dispatchScannerHelperWorkflowScan({
            rawCode: ean,
            pathname: location.pathname,
            handler: fn,
            pickingProductsPath: isWmsPickingProductsScanPath(location.pathname),
            skipReceivedTrace: true,
          });
          if (dispatched.consumed) {
            // Workflow owned this code — clear helper input so catalog query cannot re-fire lookup.
            setDevEanInput("");
          }
        } catch (err) {
          multiScanTrace("GLOBAL_SCAN_HANDLER_ERROR", {
            raw_code: ean,
            error: err instanceof Error ? err.message : "unknown",
          });
        } finally {
          dispatchBusyRef.current = false;
          refocusScannerInput();
        }
      })();
    },
    [
      location.pathname,
      location.state,
      warehouse?.id,
      navigate,
      showScannerToast,
      appendScanToHistory,
      refocusScannerInput,
    ],
  );

  const handleScanRef = useRef(handleScan);
  handleScanRef.current = handleScan;

  useEffect(() => {
    if (!ENABLE_WMS_KEYBOARD_WEDGE) return;

    let buffer = "";
    let idleTimer: ReturnType<typeof window.setTimeout> | undefined;

    const clearIdle = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        buffer = "";
        idleTimer = undefined;
      }, 2500);
    };

    const targetIsTextEntry = (target: EventTarget | null): boolean => {
      const el = target instanceof HTMLElement ? target : null;
      if (!el) return false;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        return true;
      }
      if (el.isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (targetIsTextEntry(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.repeat) return;

      if (e.key === "Enter") {
        const b = buffer.trim();
        buffer = "";
        if (idleTimer !== undefined) {
          window.clearTimeout(idleTimer);
          idleTimer = undefined;
        }
        if (b) {
          e.preventDefault();
          e.stopImmediatePropagation();
          handleScanRef.current(b);
        }
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
        e.preventDefault();
        e.stopImmediatePropagation();
        clearIdle();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
    };
  }, []);

  const value = useMemo<WmsScannerContextValue>(
    () => ({
      handleScan,
      mode,
      activeScanReceiverLabel,
      hasActiveScanHandler,
      suppressScannerHelperLookups,
      activeDocument,
      setActiveDocument: setActiveDocumentState,
      registerScanHandler,
      appendScanToHistory,
      showScannerToast,
      showScannerError,
      showScanFeedback,
      showScanFeedbackFromCode,
      clearScannerToast,
      clearScanFeedback,
      scanFeedback,
      devEanInput,
      setDevEanInput,
      clearDevScannerInput,
      refocusScannerInput,
      scannerInputRef,
      scannerInputDisabled,
      setScannerInputDisabled,
      scannerInputPlaceholder,
      setScannerInputPlaceholder,
      scannerToast,
      scannerError,
      devScanHistory,
    }),
    [
      handleScan,
      mode,
      activeScanReceiverLabel,
      hasActiveScanHandler,
      suppressScannerHelperLookups,
      activeDocument,
      registerScanHandler,
      appendScanToHistory,
      showScannerToast,
      showScannerError,
      showScanFeedback,
      showScanFeedbackFromCode,
      clearScannerToast,
      clearScanFeedback,
      scanFeedback,
      devEanInput,
      clearDevScannerInput,
      refocusScannerInput,
      scannerInputDisabled,
      scannerInputPlaceholder,
      scannerToast,
      scannerError,
      devScanHistory,
    ],
  );

  return (
    <WmsScannerContext.Provider value={value}>
      {children}
      <WmsScanFeedbackOverlay feedback={scanFeedback} onDismiss={clearScanFeedback} />
    </WmsScannerContext.Provider>
  );
}

export function useWmsScanner(): WmsScannerContextValue {
  const ctx = useContext(WmsScannerContext);
  if (!ctx) {
    throw new Error("useWmsScanner must be used within WmsScannerProvider");
  }
  return ctx;
}

/** Optional hook for pages that may render outside WMS layout. */
export function useWmsScannerOptional(): WmsScannerContextValue | null {
  return useContext(WmsScannerContext);
}
