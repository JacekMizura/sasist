import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Loader2, Package, ScanLine, Star, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  DEV_SCANNER_HISTORY_UI,
  SHOW_WMS_DEV_SCANNER,
  useWmsScanner,
  type DevScanHistoryAppendMeta,
  type DevScanHistoryEntry,
  type DevScannerFavorite,
} from "../../context/WmsScannerContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAutocompleteDropdown } from "../../hooks/useAutocompleteDropdown";
import { useDevScannerSuggestions, type DevScannerSuggestion } from "../../hooks/useDevScannerSuggestions";
import { AutocompleteDropdownPanel } from "./AutocompleteDropdownPanel";
import { DAMAGE_TENANT_ID } from "../../pages/damage/damageShared";
import {
  favoriteId,
  loadDevScannerDrawerOpen,
  loadDevScannerFavorites,
  saveDevScannerDrawerOpen,
  saveDevScannerFavorites,
  scanKindToHistoryKind,
} from "../../utils/devScannerStorage";
import { classifyWmsScanCode } from "../../utils/wmsScanClassify";

const TENANT_STORAGE_KEY = "wms.receiving.tenantId";
const Z_DEV_SCAN_BACKDROP = 10000;
const Z_DEV_SCAN_HANDLE = 10001;
const Z_DEV_SCAN_TOAST = 10050;
const PANEL_W = 340;

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
    case "operational":
      return "Kolejki operacyjne.";
    case "operational-relocation":
      return "Rozlokowanie produktów — skan nośnika logistycznego (PAL, BOX…) lub lokacji.";
    default:
      return "Symulacja skanera — zależnie od aktywnej strony WMS.";
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

function metaFromSuggestion(s: DevScannerSuggestion): DevScanHistoryAppendMeta {
  if (s.kind === "product") {
    const sku = s.subtitle?.match(/SKU:\s*([^·]+)/)?.[1]?.trim();
    const ean = s.subtitle?.match(/EAN:\s*([^·]+)/)?.[1]?.trim() ?? s.code;
    return {
      kind: "product",
      productName: s.title,
      productSku: sku ?? null,
      productEan: ean,
      productImageUrl: s.imageUrl ?? undefined,
    };
  }
  if (s.kind === "location") {
    return { kind: "location", locationLabel: s.title };
  }
  return { kind: "carrier" };
}

function favoriteFromSuggestion(s: DevScannerSuggestion): DevScannerFavorite {
  const kind = s.kind;
  const code = s.code;
  return {
    id: favoriteId(kind, code),
    kind,
    code,
    label: s.title,
    productId: s.productId,
    imageUrl: s.imageUrl,
    sku: s.subtitle?.match(/SKU:\s*([^·]+)/)?.[1]?.trim() ?? null,
    ean: kind === "product" ? code : null,
    locationCode: kind === "location" ? code : undefined,
    pinnedAt: Date.now(),
  };
}

function ProductThumb({ url, title }: { url?: string | null; title: string }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
      {url ? (
        <img src={url} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
      ) : (
        <Package size={16} className="text-slate-300" strokeWidth={2} />
      )}
      <span className="sr-only">{title}</span>
    </div>
  );
}

function SuggestionRow({
  item,
  active,
  isFavorite,
  onPick,
  onToggleFavorite,
  onOptionMouseDown,
}: {
  item: DevScannerSuggestion;
  active: boolean;
  isFavorite: boolean;
  onPick: () => void;
  onToggleFavorite: () => void;
  onOptionMouseDown: (e: ReactMouseEvent) => void;
}) {
  return (
    <li role="presentation">
      <div
        className={`flex w-full items-start gap-2 rounded-lg border px-2 py-2 transition-colors ${
          active ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200" : "border-transparent hover:bg-slate-50"
        }`}
      >
        {item.kind === "product" ? <ProductThumb url={item.imageUrl} title={item.title} /> : null}
        <button
          type="button"
          role="option"
          aria-selected={active}
          onMouseDown={onOptionMouseDown}
          onClick={onPick}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-xs font-bold leading-snug text-slate-900">{item.title}</p>
          {item.subtitle ? <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">{item.subtitle}</p> : null}
          {item.meta ? <p className="mt-0.5 truncate text-[10px] text-slate-400">{item.meta}</p> : null}
          {item.kind !== "product" ? (
            <p className="mt-0.5 font-mono text-[10px] font-bold text-indigo-700">{item.code}</p>
          ) : null}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={`shrink-0 rounded-md p-1 transition-colors ${
            isFavorite ? "text-amber-500 hover:bg-amber-50" : "text-slate-300 hover:bg-slate-100 hover:text-amber-500"
          }`}
          title={isFavorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
        >
          <Star size={16} className={isFavorite ? "fill-current" : ""} strokeWidth={2} />
        </button>
      </div>
    </li>
  );
}

function HistoryRow({
  entry,
  onReuse,
}: {
  entry: DevScanHistoryEntry;
  onReuse: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onReuse}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-left transition-colors hover:border-slate-300 hover:bg-white"
      >
        {entry.kind === "product" ? (
          <ProductThumb url={entry.productImageUrl} title={entry.productName ?? entry.code} />
        ) : null}
        <div className="min-w-0 flex-1">
          {entry.kind === "product" && entry.productName ? (
            <>
              <p className="truncate text-xs font-bold text-slate-900">{entry.productName}</p>
              <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                {entry.productSku ? `SKU: ${entry.productSku}` : null}
                {entry.productSku && entry.productEan ? " · " : null}
                {entry.productEan ? `EAN: ${entry.productEan}` : entry.code}
              </p>
            </>
          ) : (
            <p className="truncate font-mono text-xs font-bold text-slate-800">{entry.code}</p>
          )}
        </div>
      </button>
    </li>
  );
}

export default function DevScannerPanel() {
  const {
    handleScan,
    appendScanToHistory,
    mode,
    activeDocument,
    devEanInput,
    setDevEanInput,
    scannerInputRef,
    scannerInputDisabled,
    scannerInputPlaceholder,
    devScanHistory,
    scannerToast,
    scannerError,
  } = useWmsScanner();

  const { warehouse } = useWarehouse();
  const tenantId = useMemo(() => readTenantId(), []);
  const whId = warehouse?.id ?? null;

  const [expanded, setExpanded] = useState(() => loadDevScannerDrawerOpen());
  const [inputFocused, setInputFocused] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [favorites, setFavorites] = useState<DevScannerFavorite[]>(() => loadDevScannerFavorites());

  const scannerInputActive = inputFocused || devEanInput.trim().length > 0;

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

  const collapseDrawer = useCallback(() => {
    setDrawerExpanded(false);
  }, [setDrawerExpanded]);

  const { suggestions, loadingProducts } = useDevScannerSuggestions({
    query: devEanInput,
    tenantId,
    warehouseId: whId,
    favorites,
  });

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  const suggestDropdown = useAutocompleteDropdown({
    query: devEanInput,
    enabled: expanded && !scannerInputDisabled,
    canMount: suggestions.length > 0,
  });

  const showSuggestions = suggestDropdown.dropdownVisible && suggestions.length > 0;

  useEffect(() => {
    saveDevScannerFavorites(favorites);
  }, [favorites]);

  useEffect(() => {
    setSuggestIndex(0);
  }, [devEanInput, suggestions.length]);

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
    if (!SHOW_WMS_DEV_SCANNER || mode !== "picking") return;
    setDrawerExpanded(true);
    const t = window.setTimeout(() => scannerInputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [mode, setDrawerExpanded, scannerInputRef]);

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
        if (target instanceof HTMLInputElement && target.id === "wms-dev-ean") return;
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
      suggestDropdown.closeList();
    },
    [appendScanToHistory, handleScan, suggestDropdown.closeList],
  );

  const applySuggestion = useCallback(
    (s: DevScannerSuggestion) => {
      const scanCode =
        s.kind === "product"
          ? s.subtitle?.match(/EAN:\s*([^·]+)/)?.[1]?.trim() ?? s.code
          : s.code;
      setDevEanInput(scanCode);
      performScan(scanCode, metaFromSuggestion(s));
    },
    [performScan, setDevEanInput],
  );

  const toggleFavorite = useCallback((s: DevScannerSuggestion) => {
    const fav = favoriteFromSuggestion(s);
    setFavorites((prev) => {
      const exists = prev.some((p) => p.id === fav.id);
      if (exists) return prev.filter((p) => p.id !== fav.id);
      return [fav, ...prev];
    });
  }, []);

  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        if (showSuggestions) {
          suggestDropdown.handleInputEscape(e);
          return;
        }
        e.preventDefault();
        collapseDrawer();
        return;
      }

      if (showSuggestions && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSuggestIndex((i) => Math.min(i + 1, suggestions.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSuggestIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const s = suggestions[suggestIndex] ?? suggestions[0];
          if (s) applySuggestion(s);
          return;
        }
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const raw = devEanInput.trim();
        if (!raw) return;
        const kind = scanKindToHistoryKind(classifyWmsScanCode(raw));
        performScan(raw, { kind });
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
    [
      showSuggestions,
      suggestions,
      suggestIndex,
      applySuggestion,
      devEanInput,
      performScan,
      devScanHistory,
      historyIndex,
      setDevEanInput,
      collapseDrawer,
      suggestDropdown,
    ],
  );

  const historyGroups = useMemo(() => {
    const products: DevScanHistoryEntry[] = [];
    const locations: DevScanHistoryEntry[] = [];
    const carriers: DevScanHistoryEntry[] = [];
    for (const e of devScanHistory.slice(0, DEV_SCANNER_HISTORY_UI * 3)) {
      if (e.kind === "product") products.push(e);
      else if (e.kind === "location") locations.push(e);
      else if (e.kind === "carrier") carriers.push(e);
    }
    return {
      products: products.slice(0, DEV_SCANNER_HISTORY_UI),
      locations: locations.slice(0, DEV_SCANNER_HISTORY_UI),
      carriers: carriers.slice(0, DEV_SCANNER_HISTORY_UI),
    };
  }, [devScanHistory]);

  if (!SHOW_WMS_DEV_SCANNER) return null;

  const docLabel =
    activeDocument?.kind === "pz"
      ? `PZ #${activeDocument.pzId}`
      : activeDocument?.label ?? (activeDocument?.kind ? activeDocument.kind : null);

  return createPortal(
    <>
      {scannerError ? (
        <div
          className="fixed bottom-24 left-1/2 max-w-md -translate-x-1/2 rounded-lg border border-red-300/95 bg-red-50 px-4 py-3 text-center text-sm font-semibold leading-snug text-red-950 shadow-lg"
          style={{ zIndex: Z_DEV_SCAN_TOAST }}
          role="alert"
        >
          {scannerError}
        </div>
      ) : scannerToast ? (
        <div
          className="fixed bottom-24 left-1/2 max-w-md -translate-x-1/2 rounded-lg border border-amber-200/90 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-950 shadow-md"
          style={{ zIndex: Z_DEV_SCAN_TOAST }}
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
        style={{ zIndex: Z_DEV_SCAN_BACKDROP, width: PANEL_W }}
        aria-hidden={!expanded}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-black leading-tight text-slate-900">Skaner testowy</h2>
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
          <div ref={suggestDropdown.containerRef} className="relative shrink-0">
            <label htmlFor="wms-dev-ean" className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
              Kod skanu
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
                suggestDropdown.notifyInputChanged(e.target.value);
              }}
              onFocus={() => {
                setInputFocused(true);
                suggestDropdown.onInputFocus();
              }}
              onBlur={() => setInputFocused(false)}
              onKeyDown={onKeyDown}
              disabled={scannerInputDisabled}
              placeholder={scannerInputPlaceholder || "EAN, SKU, lokalizacja, PAL-/BOX-…"}
              className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 font-mono text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50"
            />
            {loadingProducts ? (
              <Loader2 className="pointer-events-none absolute right-3 top-[calc(50%+6px)] h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
            ) : null}

            <AutocompleteDropdownPanel
              mounted={suggestDropdown.canShowDropdown}
              visible={showSuggestions}
              className="z-10 mt-1"
            >
              <ul className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
                {suggestions.map((s, i) => (
                  <SuggestionRow
                    key={s.id}
                    item={s}
                    active={i === suggestIndex}
                    isFavorite={favoriteIds.has(favoriteId(s.kind, s.code))}
                    onPick={() => applySuggestion(s)}
                    onToggleFavorite={() => toggleFavorite(s)}
                    onOptionMouseDown={suggestDropdown.preventOptionMouseDown}
                  />
                ))}
              </ul>
            </AutocompleteDropdownPanel>

            <button
              type="button"
              disabled={scannerInputDisabled || !devEanInput.trim()}
              onClick={() => {
                const raw = devEanInput.trim();
                performScan(raw, { kind: scanKindToHistoryKind(classifyWmsScanCode(raw)) });
              }}
              className="mt-2 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-black uppercase tracking-wide text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Skanuj Enter
            </button>
          </div>

          {favorites.length > 0 ? (
            <section className="shrink-0">
              <p className="mb-1.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
                <Star size={11} className="fill-amber-400 text-amber-500" />
                Ulubione skany
              </p>
              <ul className="max-h-28 space-y-1 overflow-y-auto pr-0.5">
                {favorites.map((f) => (
                  <li key={f.id}>
                    <div className="flex items-center gap-1 rounded-lg border border-amber-100 bg-amber-50/80 pr-1">
                      {f.kind === "product" ? (
                        <ProductThumb url={f.imageUrl} title={f.label} />
                      ) : null}
                      <button
                        type="button"
                        disabled={scannerInputDisabled}
                        onClick={() => {
                          setDevEanInput(f.code);
                          performScan(f.code, {
                            kind: f.kind,
                            productName: f.kind === "product" ? f.label : undefined,
                            productSku: f.sku,
                            productEan: f.ean ?? undefined,
                            productImageUrl: f.imageUrl ?? undefined,
                            locationLabel: f.locationCode,
                          });
                        }}
                        className="min-w-0 flex-1 truncate px-2 py-2 text-left text-xs font-bold text-slate-800 disabled:opacity-40"
                      >
                        {f.label}
                        <span className="mt-0.5 block font-mono text-[10px] font-medium text-slate-500">{f.code}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFavorite(f.id)}
                        className="shrink-0 rounded p-1 text-slate-400 hover:text-red-600"
                        title="Usuń"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Ostatnie skany</p>

            {historyGroups.products.length > 0 ? (
              <div>
                <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Produkty</p>
                <ul className="space-y-1">
                  {historyGroups.products.map((e) => (
                    <HistoryRow key={`${e.code}-${e.scannedAt}`} entry={e} onReuse={() => performScan(e.code, e)} />
                  ))}
                </ul>
              </div>
            ) : null}

            {historyGroups.locations.length > 0 ? (
              <div>
                <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Lokalizacje</p>
                <ul className="space-y-1">
                  {historyGroups.locations.map((e) => (
                    <HistoryRow key={`${e.code}-${e.scannedAt}`} entry={e} onReuse={() => performScan(e.code, e)} />
                  ))}
                </ul>
              </div>
            ) : null}

            {historyGroups.carriers.length > 0 ? (
              <div>
                <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Nośniki</p>
                <ul className="space-y-1">
                  {historyGroups.carriers.map((e) => (
                    <HistoryRow key={`${e.code}-${e.scannedAt}`} entry={e} onReuse={() => performScan(e.code, e)} />
                  ))}
                </ul>
              </div>
            ) : null}

            {devScanHistory.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">Brak historii skanów</p>
            ) : null}
          </section>
        </div>
      </aside>

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="wms-dev-scanner-drawer"
        aria-label={expanded ? "Zwiń panel skanera (Ctrl+Shift+S)" : "Otwórz panel skanera (Ctrl+Shift+S)"}
        title={expanded ? "Zwiń skaner (Ctrl+Shift+S)" : "Otwórz skaner (Ctrl+Shift+S)"}
        className={`fixed right-0 top-1/2 flex h-[88px] w-8 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-l-lg border border-r-0 border-slate-700 bg-[#111] py-2 text-white shadow-lg transition-all hover:bg-neutral-900 ${
          scannerInputActive
            ? "shadow-[0_0_14px_rgba(139,92,246,0.55)] ring-1 ring-violet-400/70"
            : ""
        }`}
        style={{ zIndex: Z_DEV_SCAN_HANDLE }}
        onClick={toggleDrawer}
      >
        <ScanLine size={16} strokeWidth={2.25} className="shrink-0 text-violet-300" aria-hidden />
        <span
          className="text-[8px] font-black uppercase tracking-[0.2em] text-white/80 [writing-mode:vertical-lr]"
          aria-hidden
        >
          SCAN
        </span>
      </button>
    </>,
    document.body,
  );
}
