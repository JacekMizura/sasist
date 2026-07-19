import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Keyboard, Loader2, ScanLine, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  DEV_SCANNER_HISTORY_UI,
  SHOW_WMS_DEV_SCANNER,
  useWmsScanner,
  type DevScanHistoryAppendMeta,
  type DevScanHistoryEntry,
  type DevScannerFavorite,
} from "../../../context/WmsScannerContext";
import { useWarehouse } from "../../../context/WarehouseContext";
import { useDevScannerCatalog } from "../../../hooks/useDevScannerCatalog";
import { useIsHandheldDevice } from "../../../hooks/useIsHandheldDevice";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import {
  favoriteId,
  loadDevScannerDrawerOpen,
  loadDevScannerFavorites,
  saveDevScannerDrawerOpen,
  saveDevScannerFavorites,
  scanKindToHistoryKind,
} from "../../../utils/devScannerStorage";
import { classifyWmsScanCode } from "../../../utils/wmsScanClassify";
import {
  itemMatchesCategory,
  type DevScannerCategoryId,
} from "./categories";
import { DevScannerCategoryStrip } from "./DevScannerCategoryStrip";
import { DevScannerHistorySection } from "./DevScannerHistorySection";
import { DevScannerItemCard } from "./DevScannerItemCard";
import { DevScannerQuickAccess } from "./DevScannerQuickAccess";
import type { DevScannerCatalogItem } from "./types";

const TENANT_STORAGE_KEY = "wms.receiving.tenantId";
const Z_BACKDROP = 10000;
const Z_HANDLE = 10001;
const Z_TOAST = 10050;

function modeHint(mode: string): string {
  switch (mode) {
    case "receiving-count":
      return "Przyjęcie PZ — nośnik, EAN, opakowania, lokalizacja rampy.";
    case "receiving":
      return "Lista PZ — wybierz dokument.";
    case "picking":
      return "Zbieranie — skan przypisze linię.";
    case "putaway":
      return "Rozlokowanie PZ — EAN, lokalizacja, nośnik.";
    case "product_preview":
      return "Podgląd produktu — skan EAN/SKU.";
    case "packing":
      return "Pakowanie — skan wózka / produktu / kartonu.";
    case "operational":
      return "Kolejki operacyjne.";
    case "operational-relocation":
      return "Rozlokowanie — skan nośnika lub lokacji.";
    default:
      return "Pomocnik magazyniera — szybkie odnajdywanie kodów i skan.";
  }
}

function readTenantId(): number {
  try {
    const raw = localStorage.getItem(TENANT_STORAGE_KEY);
    const n = raw != null ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* ignore */
  }
  return DAMAGE_TENANT_ID;
}

function metaFromItem(s: DevScannerCatalogItem): DevScanHistoryAppendMeta {
  return {
    kind: s.kind,
    displayName: s.name,
    productName: s.kind === "product" ? s.name : undefined,
    productSku: s.sku,
    productEan: s.ean ?? (s.kind === "product" ? s.code : undefined),
    productImageUrl: s.imageUrl ?? undefined,
    locationLabel: s.kind === "location" ? s.name : undefined,
    relationLabel: s.relationLabel,
    parentCartCode: s.parentCartCode,
    parentCartName: s.parentCartName,
  };
}

function favoriteFromItem(s: DevScannerCatalogItem): DevScannerFavorite {
  return {
    id: favoriteId(s.kind, s.code),
    kind: s.kind,
    code: s.code,
    label: s.name,
    productId: s.productId,
    imageUrl: s.imageUrl,
    sku: s.sku,
    ean: s.ean,
    locationCode: s.kind === "location" ? s.code : undefined,
    relationLabel: s.relationLabel,
    parentCartCode: s.parentCartCode,
    parentCartName: s.parentCartName,
    cartId: s.cartId,
    pinnedAt: Date.now(),
  };
}

function lastHistoryOfKind(
  history: DevScanHistoryEntry[],
  kind: DevScanHistoryEntry["kind"],
): DevScanHistoryEntry | null {
  return history.find((e) => e.kind === kind) ?? null;
}

export default function DevScannerPanel() {
  const {
    handleScan,
    appendScanToHistory,
    mode,
    activeDocument,
    activeScanReceiverLabel,
    hasActiveScanHandler,
    suppressScannerHelperLookups,
    devEanInput,
    setDevEanInput,
    clearDevScannerInput,
    scannerInputRef,
    scannerInputDisabled,
    scannerInputPlaceholder,
    devScanHistory,
    scannerToast,
    scannerError,
  } = useWmsScanner();

  const { warehouse } = useWarehouse();
  const isHandheld = useIsHandheldDevice();
  const tenantId = useMemo(() => readTenantId(), []);
  const whId = warehouse?.id ?? null;
  const panelW = isHandheld ? "min(100vw, 420px)" : "400px";

  const [expanded, setExpanded] = useState(() => loadDevScannerDrawerOpen());
  const [inputFocused, setInputFocused] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<DevScannerFavorite[]>(() => loadDevScannerFavorites());
  const [category, setCategory] = useState<DevScannerCategoryId>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const scannerInputActive = inputFocused || devEanInput.trim().length > 0;
  // During active picking workflow, scan input must NOT drive products/search or returns lookup.
  // Only the dedicated search box may query the catalog.
  const catalogQuery = suppressScannerHelperLookups
    ? searchQuery.trim()
    : searchQuery.trim() || devEanInput.trim();

  const setDrawerExpanded = useCallback((next: boolean) => {
    setExpanded(next);
    saveDevScannerDrawerOpen(next);
  }, []);

  const toggleDrawer = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      saveDevScannerDrawerOpen(next);
      return next;
    });
  }, []);

  const collapseDrawer = useCallback(() => setDrawerExpanded(false), [setDrawerExpanded]);

  const { catalog, allCatalog, loading, ensureCartDetail } = useDevScannerCatalog({
    query: catalogQuery,
    tenantId,
    warehouseId: whId,
    favorites,
    enabled: SHOW_WMS_DEV_SCANNER && expanded,
  });

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  useEffect(() => {
    saveDevScannerFavorites(favorites);
  }, [favorites]);

  useEffect(() => {
    if (!SHOW_WMS_DEV_SCANNER || !expanded) return;
    const t = window.setTimeout(() => scannerInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [expanded, scannerInputRef]);

  useEffect(() => {
    if (!SHOW_WMS_DEV_SCANNER) return;
    const fn = () => setDrawerExpanded(true);
    window.addEventListener("wms-dev-scanner-open", fn as EventListener);
    return () => window.removeEventListener("wms-dev-scanner-open", fn as EventListener);
  }, [setDrawerExpanded]);

  useEffect(() => {
    if (!SHOW_WMS_DEV_SCANNER) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        toggleDrawer();
        return;
      }
      if (e.key === "Escape" && expanded) {
        const target = e.target;
        if (target instanceof HTMLInputElement && (target.id === "wms-dev-ean" || target.id === "wms-dev-search"))
          return;
        setDrawerExpanded(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded, setDrawerExpanded, toggleDrawer]);

  const performScan = useCallback(
    (code: string, meta?: DevScanHistoryAppendMeta) => {
      const key = code.trim();
      if (!key) return;
      appendScanToHistory(key, meta);
      handleScan(key);
      setHistoryIndex(null);
    },
    [appendScanToHistory, handleScan],
  );

  const scanCurrentInput = useCallback(() => {
    const raw = devEanInput.trim();
    if (!raw) return;
    const fromCatalog = allCatalog.find((i) => i.code.toUpperCase() === raw.toUpperCase());
    if (fromCatalog) {
      performScan(fromCatalog.code, metaFromItem(fromCatalog));
      return;
    }
    performScan(raw, { kind: scanKindToHistoryKind(classifyWmsScanCode(raw)) });
  }, [devEanInput, performScan, allCatalog]);

  const applyItem = useCallback(
    (s: DevScannerCatalogItem) => {
      const scanCode = s.kind === "product" ? s.ean || s.code : s.code;
      setDevEanInput(scanCode);
      performScan(scanCode, metaFromItem(s));
    },
    [performScan, setDevEanInput],
  );

  const toggleFavorite = useCallback((s: DevScannerCatalogItem) => {
    const fav = favoriteFromItem(s);
    setFavorites((prev) => {
      const exists = prev.some((p) => p.id === fav.id);
      if (exists) return prev.filter((p) => p.id !== fav.id);
      return [fav, ...prev];
    });
  }, []);

  const toggleExpand = useCallback(
    (item: DevScannerCatalogItem) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      if (item.kind === "cart" && item.cartId != null) {
        void ensureCartDetail(item.cartId);
      }
    },
    [ensureCartDetail],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        collapseDrawer();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        scanCurrentInput();
        return;
      }
      if (e.key === "ArrowUp") {
        if (devScanHistory.length === 0) return;
        e.preventDefault();
        const next = historyIndex === null ? 0 : Math.min(historyIndex + 1, devScanHistory.length - 1);
        setHistoryIndex(next);
        setDevEanInput(devScanHistory[next]?.code ?? "");
        return;
      }
      if (e.key === "ArrowDown") {
        if (historyIndex === null) return;
        e.preventDefault();
        if (historyIndex <= 0) {
          setHistoryIndex(null);
          setDevEanInput("");
          return;
        }
        const next = historyIndex - 1;
        setHistoryIndex(next);
        setDevEanInput(devScanHistory[next]?.code ?? "");
      }
    },
    [scanCurrentInput, devScanHistory, historyIndex, setDevEanInput, collapseDrawer],
  );

  const categoryCounts = useMemo(() => {
    const counts = {
      all: 0,
      carts: 0,
      carts_with_baskets: 0,
      baskets: 0,
      products: 0,
      locations: 0,
      carriers: 0,
      orders: 0,
      other: 0,
      favorites: 0,
    } as Record<DevScannerCategoryId, number>;

    // Deduplicate carts vs baskets in "all": count unique items in filtered catalog
    const seen = new Set<string>();
    for (const item of catalog) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const isFav = favoriteIds.has(favoriteId(item.kind, item.code));
      const opts = { basketCount: item.basketCount, isFavorite: isFav, cartType: item.cartType };
      counts.all += 1;
      (Object.keys(counts) as DevScannerCategoryId[]).forEach((cat) => {
        if (cat === "all") return;
        if (itemMatchesCategory(item.kind, cat, opts)) counts[cat] += 1;
      });
    }
    return counts;
  }, [catalog, favoriteIds]);

  const visibleItems = useMemo(() => {
    return catalog.filter((item) => {
      // In list view, show carts (not duplicate flat baskets) unless browsing baskets category
      if (category === "baskets") return item.kind === "basket";
      if (category === "carts" || category === "carts_with_baskets") return item.kind === "cart";
      if (item.kind === "basket" && category === "all") {
        // Nested under cart tree by default; flat list only when searching
        return Boolean(searchQuery.trim());
      }
      const isFav = favoriteIds.has(favoriteId(item.kind, item.code));
      return itemMatchesCategory(item.kind, category, {
        basketCount: item.basketCount,
        isFavorite: isFav,
        cartType: item.cartType,
      });
    });
  }, [catalog, category, favoriteIds, searchQuery]);

  const recentScans = useMemo(
    () => devScanHistory.slice(0, DEV_SCANNER_HISTORY_UI),
    [devScanHistory],
  );

  const quickSlots = useMemo(
    () => [
      { kind: "cart" as const, label: "Ostatni wózek", entry: lastHistoryOfKind(devScanHistory, "cart") },
      { kind: "basket" as const, label: "Ostatni koszyk", entry: lastHistoryOfKind(devScanHistory, "basket") },
      {
        kind: "location" as const,
        label: "Ostatnia lokalizacja",
        entry: lastHistoryOfKind(devScanHistory, "location"),
      },
      {
        kind: "product" as const,
        label: "Ostatni produkt",
        entry: lastHistoryOfKind(devScanHistory, "product"),
      },
    ],
    [devScanHistory],
  );

  if (!SHOW_WMS_DEV_SCANNER) return null;

  const docLabel =
    activeDocument?.kind === "pz"
      ? `PZ #${activeDocument.pzId}`
      : activeDocument?.label ?? (activeDocument?.kind ? activeDocument.kind : null);

  const canScan = !scannerInputDisabled && Boolean(devEanInput.trim());

  return createPortal(
    <>
      {scannerError ? (
        <div
          className="fixed bottom-24 left-1/2 max-w-md -translate-x-1/2 rounded-lg border border-red-300/95 bg-red-50 px-4 py-3 text-center text-sm font-semibold leading-snug text-red-950 shadow-lg"
          style={{ zIndex: Z_TOAST }}
          role="alert"
        >
          {scannerError}
        </div>
      ) : scannerToast ? (
        <div
          className="fixed bottom-24 left-1/2 max-w-md -translate-x-1/2 rounded-lg border border-amber-200/90 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-950 shadow-md"
          style={{ zIndex: Z_TOAST }}
          role="status"
        >
          {scannerToast}
        </div>
      ) : null}

      <aside
        id="wms-dev-scanner-drawer"
        data-dev-scanner-drawer
        className={`fixed top-0 right-0 flex h-screen flex-col border-l border-slate-200 bg-white shadow-[-8px_0_24px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out will-change-transform ${
          expanded ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ zIndex: Z_BACKDROP, width: panelW }}
        aria-hidden={!expanded}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-sm font-black leading-tight text-slate-900">
              <Keyboard size={16} className="shrink-0 text-sky-600" aria-hidden />
              Emulator skanera
            </h2>
            <p className="mt-0.5 text-[10px] font-semibold text-sky-700">Scanner Helper — szybkie kody magazynowe</p>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{modeHint(mode)}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-slate-600">
                {mode}
              </span>
              {docLabel ? (
                <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                  {docLabel}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={collapseDrawer}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Zwiń panel skanera (Esc)"
            title="Zwiń (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
          <div className="shrink-0 space-y-2">
            <label htmlFor="wms-dev-ean" className="block text-[10px] font-black uppercase tracking-wide text-slate-400">
              Skanuj kod
            </label>
            <input
              id="wms-dev-ean"
              ref={scannerInputRef}
              type="text"
              autoComplete="off"
              value={devEanInput}
              onChange={(e) => {
                setHistoryIndex(null);
                setDevEanInput(e.target.value);
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={onKeyDown}
              disabled={scannerInputDisabled}
              placeholder={scannerInputPlaceholder || "Wózek, koszyk, EAN, lokalizacja…"}
              className={`w-full rounded-xl border-2 border-slate-200 px-3 font-mono text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 ${
                isHandheld ? "min-h-12 py-3" : "py-2.5"
              }`}
            />

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={!canScan}
                onClick={scanCurrentInput}
                className={`rounded-xl bg-slate-900 text-xs font-black uppercase tracking-wide text-white hover:bg-slate-800 disabled:opacity-40 ${
                  isHandheld ? "min-h-12" : "py-2.5"
                }`}
              >
                Skanuj
              </button>
              <button
                type="button"
                disabled={!devEanInput && !searchQuery}
                onClick={() => {
                  clearDevScannerInput();
                  setSearchQuery("");
                  setHistoryIndex(null);
                }}
                className={`rounded-xl border border-slate-200 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-600 hover:bg-slate-100 disabled:opacity-40 ${
                  isHandheld ? "min-h-12" : "py-2.5"
                }`}
              >
                Wyczyść
              </button>
            </div>

            <label htmlFor="wms-dev-search" className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
              <Search size={11} />
              Szukaj (nazwa / kod / EAN / SKU)
            </label>
            <div className="relative">
              <input
                id="wms-dev-search"
                type="search"
                autoComplete="off"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="np. WÓZ, koszyk, SKU…"
                className={`w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-sm text-slate-900 outline-none focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 ${
                  isHandheld ? "min-h-11 py-2.5" : "py-2"
                }`}
              />
              {loading ? (
                <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
              ) : null}
            </div>
          </div>

          <div className="shrink-0">
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">Kategorie</p>
            <DevScannerCategoryStrip
              active={category}
              counts={categoryCounts}
              onChange={setCategory}
              compact={isHandheld}
            />
          </div>

          <DevScannerQuickAccess
            slots={quickSlots}
            large={isHandheld}
            onScan={(e) => {
              setDevEanInput(e.code);
              performScan(e.code, e);
            }}
          />

          <section className="flex min-h-0 flex-[1.2] flex-col gap-1.5 overflow-hidden">
            <p className="shrink-0 text-[10px] font-black uppercase tracking-wide text-slate-400">
              Wyniki {visibleItems.length > 0 ? `(${visibleItems.length})` : ""}
            </p>
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
              {visibleItems.length === 0 ? (
                <li className="py-6 text-center text-xs text-slate-400">
                  {catalogQuery ? "Brak wyników dla zapytania" : "Wybierz kategorię lub wpisz nazwę / kod"}
                </li>
              ) : (
                visibleItems.slice(0, 80).map((item) => (
                  <DevScannerItemCard
                    key={item.id}
                    item={item}
                    large={isHandheld}
                    isFavorite={favoriteIds.has(favoriteId(item.kind, item.code))}
                    expanded={expandedIds.has(item.id)}
                    onToggleExpand={() => toggleExpand(item)}
                    onScan={() => applyItem(item)}
                    onToggleFavorite={() => toggleFavorite(item)}
                    onScanChild={(child) => applyItem(child)}
                  />
                ))
              )}
            </ul>
          </section>

          <DevScannerHistorySection
            entries={recentScans}
            large={isHandheld}
            onReuse={(e) => {
              setDevEanInput(e.code);
              performScan(e.code, e);
            }}
          />
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-3 py-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Aktywny odbiorca skanów</p>
          <p
            className={`mt-1 text-sm font-bold ${
              hasActiveScanHandler || activeScanReceiverLabel !== "Brak aktywnego odbiorcy"
                ? "text-sky-800"
                : "text-slate-500"
            }`}
          >
            {activeScanReceiverLabel}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">Ctrl+Shift+S — otwórz / zamknij · Enter = skan</p>
        </div>
      </aside>

      {!expanded ? (
        <button
          type="button"
          aria-expanded={false}
          aria-controls="wms-dev-scanner-drawer"
          aria-label="Otwórz Scanner Helper (Ctrl+Shift+S)"
          title="Scanner Helper (Ctrl+Shift+S)"
          className={`fixed right-3 bottom-6 flex items-center gap-2 rounded-full border border-slate-700 bg-[#111] px-3.5 py-2.5 text-white shadow-lg transition-all hover:bg-neutral-900 ${
            scannerInputActive ? "ring-2 ring-sky-400/80 shadow-[0_0_16px_rgba(56,189,248,0.45)]" : ""
          }`}
          style={{ zIndex: Z_HANDLE }}
          onClick={toggleDrawer}
        >
          <ScanLine size={18} strokeWidth={2.25} className="shrink-0 text-sky-300" aria-hidden />
          <span className="text-xs font-bold tracking-wide">Skaner</span>
        </button>
      ) : (
        <button
          type="button"
          aria-expanded
          aria-controls="wms-dev-scanner-drawer"
          aria-label="Zwiń Scanner Helper (Ctrl+Shift+S)"
          title="Zwiń skaner (Ctrl+Shift+S)"
          className="fixed top-1/2 flex h-[88px] w-8 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-l-lg border border-r-0 border-slate-700 bg-[#111] py-2 text-white shadow-lg transition-all hover:bg-neutral-900"
          style={{ zIndex: Z_HANDLE, right: panelW }}
          onClick={toggleDrawer}
        >
          <ScanLine size={16} strokeWidth={2.25} className="shrink-0 text-sky-300" aria-hidden />
          <span
            className="text-[8px] font-black uppercase tracking-[0.2em] text-white/80 [writing-mode:vertical-lr]"
            aria-hidden
          >
            SCAN
          </span>
        </button>
      )}
    </>,
    document.body,
  );
}
