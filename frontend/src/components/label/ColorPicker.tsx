import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ColorPickerPopover } from "./ColorPickerPopover";
import { formatCmykPercent, hexToCmyk01, parseHex6OrNull } from "../../utils/colorCmyk";

const STORAGE_KEY = "label_user_colors";
const FAVORITES_STORAGE_KEY = "label.favoriteColors";

function normalizeHex6(raw: string | undefined, fallback: string): string {
  let h = (raw ?? "").trim();
  if (!h) return fallback;
  if (!h.startsWith("#")) h = `#${h}`;
  if (h.length === 4 && /^#[0-9a-f]{3}$/i.test(h)) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(h)) return h.toLowerCase();
  return fallback;
}

/** Valid #rrggbb only; otherwise null (orphan / template colors). */
function parseHexOrNull(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  let h = raw.trim();
  if (!h.startsWith("#")) h = `#${h}`;
  if (h.length === 4 && /^#[0-9a-f]{3}$/i.test(h)) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(h)) return h.toLowerCase();
  return null;
}

function loadCustomFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is string => typeof s === "string")
      .map((s) => normalizeHex6(s, ""))
      .filter((h) => /^#[0-9a-f]{6}$/.test(h));
  } catch {
    return [];
  }
}

function saveCustomToStorage(colors: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {
    /* quota */
  }
}

const FAVORITES_MAX = 48;

function loadFavoritesFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is string => typeof s === "string")
      .map((s) => normalizeHex6(s, ""))
      .filter((h) => /^#[0-9a-f]{6}$/.test(h));
  } catch {
    return [];
  }
}

function saveFavoritesToStorage(colors: string[]) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(colors));
  } catch {
    /* quota */
  }
}

export type ColorPickerProps = {
  value: string | undefined;
  onChange: (hex: string) => void;
  /** Used when opening popover if `value` is missing/invalid. */
  fallback?: string;
};

type PopoverState = { open: boolean; rect: DOMRect | null; seed: string; mountKey: number };

type ColorInfoState = { hex: string; anchor: DOMRect };

/**
 * Session palette (`label_user_colors`) + global favorites (`label.favoriteColors`).
 * Favorites: click applies color; «+» adds current effective color.
 */
export function ColorPicker({ value, onChange, fallback = "#808080" }: ColorPickerProps) {
  const effective = normalizeHex6(value, fallback);
  const [favoriteColors, setFavoriteColors] = useState<string[]>(() =>
    typeof window !== "undefined" ? loadFavoritesFromStorage() : []
  );
  const [customColors, setCustomColors] = useState<string[]>(() =>
    typeof window !== "undefined" ? loadCustomFromStorage() : []
  );
  const [popover, setPopover] = useState<PopoverState>({
    open: false,
    rect: null,
    seed: effective,
    mountKey: 0,
  });
  const [colorInfo, setColorInfo] = useState<ColorInfoState | null>(null);
  const [copyFlash, setCopyFlash] = useState(false);

  const persistCustom = useCallback((next: string[]) => {
    const deduped = [...new Set(next.map((c) => normalizeHex6(c, "")).filter((h) => /^#[0-9a-f]{6}$/.test(h)))];
    setCustomColors(deduped);
    saveCustomToStorage(deduped);
  }, []);

  const persistFavorites = useCallback((next: string[]) => {
    const deduped = [...new Set(next.map((c) => normalizeHex6(c, fallback)).filter((h) => /^#[0-9a-f]{6}$/.test(h)))].slice(
      0,
      FAVORITES_MAX
    );
    setFavoriteColors(deduped);
    saveFavoritesToStorage(deduped);
  }, [fallback]);

  const favoritesList = useMemo(
    () => [...new Set(favoriteColors.map((c) => normalizeHex6(c, fallback)).filter((h) => /^#[0-9a-f]{6}$/.test(h)))],
    [favoriteColors, fallback]
  );

  const currentInFavorites = useMemo(
    () => favoritesList.some((c) => c.toLowerCase() === effective.toLowerCase()),
    [favoritesList, effective]
  );

  const addCurrentToFavorites = useCallback(() => {
    if (favoritesList.length >= FAVORITES_MAX) return;
    const h = effective.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(h)) return;
    if (favoritesList.some((c) => c.toLowerCase() === h)) return;
    persistFavorites([...favoritesList, h]);
  }, [effective, favoritesList, persistFavorites]);

  const removeFavoriteColor = useCallback(
    (hex: string) => {
      const h = normalizeHex6(hex, fallback).toLowerCase();
      persistFavorites(favoritesList.filter((c) => c.toLowerCase() !== h));
    },
    [favoritesList, persistFavorites, fallback]
  );

  const palette = useMemo(
    () => [...new Set(customColors.map((c) => normalizeHex6(c, fallback)).filter((h) => /^#[0-9a-f]{6}$/.test(h)))],
    [customColors, fallback]
  );

  const orphanHex = useMemo(() => {
    const v = parseHexOrNull(value);
    if (!v) return null;
    if (palette.some((p) => p.toLowerCase() === v.toLowerCase())) return null;
    return v;
  }, [value, palette]);

  const commit = useCallback(
    (hex: string) => {
      const n = normalizeHex6(hex, fallback);
      onChange(n);
    },
    [onChange, fallback]
  );

  const openPopover = useCallback(
    (el: HTMLElement, seed: string) => {
      setColorInfo(null);
      setPopover((s) => ({
        open: true,
        rect: el.getBoundingClientRect(),
        seed: normalizeHex6(seed, fallback),
        mountKey: s.mountKey + 1,
      }));
    },
    [fallback]
  );

  const closePopover = useCallback(() => {
    setPopover((s) => ({ ...s, open: false, rect: null }));
  }, []);

  const closeColorInfo = useCallback(() => setColorInfo(null), []);

  useEffect(() => {
    if (!colorInfo) return;
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (el.closest("[data-color-picker-root]")) return;
      const panel = document.getElementById("label-color-info-popover");
      if (panel?.contains(el)) return;
      setColorInfo(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setColorInfo(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [colorInfo]);

  const openColorInfo = useCallback((el: HTMLElement, hex: string) => {
    const h = parseHex6OrNull(hex);
    if (!h) return;
    setColorInfo({ hex: h, anchor: el.getBoundingClientRect() });
    setCopyFlash(false);
  }, []);

  const copyHexToClipboard = useCallback(async (hex: string) => {
    const upper = hex.toUpperCase();
    try {
      await navigator.clipboard.writeText(upper);
      setCopyFlash(true);
      window.setTimeout(() => setCopyFlash(false), 2000);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = upper;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopyFlash(true);
        window.setTimeout(() => setCopyFlash(false), 2000);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const onApplyFromPopover = useCallback(
    (hex: string) => {
      const h = /^#[0-9a-f]{6}$/i.test((hex ?? "").trim()) ? hex.trim().toLowerCase() : null;
      if (!h) return;
      onChange(h);
      persistCustom([...new Set([...customColors, h])]);
    },
    [onChange, customColors, persistCustom]
  );

  const removePaletteColor = useCallback(
    (hex: string) => {
      const h = normalizeHex6(hex, fallback).toLowerCase();
      const next = customColors.filter((c) => normalizeHex6(c, fallback).toLowerCase() !== h);
      persistCustom(next);
    },
    [customColors, persistCustom, fallback]
  );

  const swatchClass =
    "h-7 w-7 shrink-0 rounded-md border border-slate-300/80 shadow-sm transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";
  const selectedRing = " ring-2 ring-slate-700 ring-offset-2 ring-offset-slate-100";

  const infoCmyk = colorInfo ? formatCmykPercent(hexToCmyk01(colorInfo.hex)) : "";
  const infoHexDisplay = colorInfo ? colorInfo.hex.toUpperCase() : "";

  return (
    <div className="w-full rounded-xl border border-slate-200/90 bg-slate-100/90 p-2" data-color-picker-root>
      <div className="mb-3 border-b border-slate-200/80 pb-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Ulubione kolory</p>
        <div className="flex flex-wrap items-center gap-2" title="Klik próbki — zastosuj kolor; + — dodaj bieżący kolor">
          {favoritesList.map((hex) => {
            const sel = effective.toLowerCase() === hex.toLowerCase();
            return (
              <div key={`fav-${hex}`} className="relative shrink-0 group">
                <button
                  type="button"
                  title={`${hex} — ulubiony (klik = zastosuj)`}
                  onClick={() => commit(hex)}
                  className={swatchClass + (sel ? selectedRing : "") + " ring-1 ring-amber-400/40"}
                  style={{ backgroundColor: hex }}
                  aria-label={`Ulubiony ${hex}`}
                  aria-pressed={sel}
                />
                <button
                  type="button"
                  title="Usuń z ulubionych"
                  aria-label={`Usuń ${hex} z ulubionych`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeFavoriteColor(hex);
                  }}
                  className="absolute -right-1 -top-1 z-[1] flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 bg-white text-[10px] font-bold leading-none text-slate-600 shadow hover:bg-red-50 hover:border-red-400 hover:text-red-700 opacity-100 sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:pointer-events-auto transition-opacity"
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            title={
              favoritesList.length >= FAVORITES_MAX
                ? `Maks. ${FAVORITES_MAX} ulubionych — usuń kolor (×), aby dodać nowy`
                : currentInFavorites
                  ? "Ten kolor jest już w ulubionych"
                  : "Dodaj bieżący kolor do ulubionych"
            }
            onClick={addCurrentToFavorites}
            disabled={favoritesList.length >= FAVORITES_MAX || currentInFavorites}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-amber-500/70 bg-white text-base font-light leading-none text-amber-800 transition-transform hover:scale-105 hover:border-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            aria-label="Dodaj bieżący kolor do ulubionych"
          >
            +
          </button>
        </div>
        {favoritesList.length === 0 && (
          <p className="mt-1 text-[9px] text-slate-500 leading-snug">Brak zapisanych — ustaw kolor i kliknij +.</p>
        )}
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        title="Kliknij próbkę — HEX i CMYK; «Zastosuj» wybiera kolor"
      >
        {palette.map((hex) => {
          const sel = effective.toLowerCase() === hex.toLowerCase();
          return (
            <div key={hex} className="relative shrink-0 group">
              <button
                type="button"
                title={`${hex} — kliknij: HEX/CMYK; podwójny klik: zastosuj od razu`}
                onClick={(e) => openColorInfo(e.currentTarget, hex)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  commit(hex);
                  closeColorInfo();
                }}
                className={swatchClass + (sel ? selectedRing : "")}
                style={{ backgroundColor: hex }}
                aria-label={hex}
                aria-pressed={sel}
              />
              <button
                type="button"
                title="Usuń z palety"
                aria-label={`Usuń ${hex} z palety`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removePaletteColor(hex);
                }}
                className="absolute -right-1 -top-1 z-[1] flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 bg-white text-[10px] font-bold leading-none text-slate-600 shadow hover:bg-red-50 hover:border-red-400 hover:text-red-700 opacity-100 sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:pointer-events-auto transition-opacity"
              >
                ×
              </button>
            </div>
          );
        })}
        {orphanHex && (
          <button
            type="button"
            title={`${orphanHex} (nie zapisany w palecie) — kliknij: HEX/CMYK; podwójny klik: zastosuj`}
            onClick={(e) => openColorInfo(e.currentTarget, orphanHex)}
            onDoubleClick={(e) => {
              e.preventDefault();
              commit(orphanHex);
              closeColorInfo();
            }}
            className={
              swatchClass +
              " border-dashed border-2 border-amber-500/70" +
              (effective.toLowerCase() === orphanHex.toLowerCase() ? selectedRing : "")
            }
            style={{ backgroundColor: orphanHex }}
            aria-label={`Kolor szablonu ${orphanHex}`}
            aria-pressed={effective.toLowerCase() === orphanHex.toLowerCase()}
          />
        )}
        <button
          type="button"
          title="Dodaj kolor"
          onClick={(e) => openPopover(e.currentTarget, value ? effective : fallback)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-slate-400 bg-white text-base font-light leading-none text-slate-600 transition-transform hover:scale-105 hover:border-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          aria-label="Otwórz wybór koloru"
        >
          +
        </button>
      </div>
      {palette.length > 0 && (
        <p className="mt-1.5 text-[9px] text-slate-500 leading-snug">
          Kliknij próbkę, aby zobaczyć HEX i CMYK (jak w PDF na druk). Najedź na kolor i kliknij ×, aby usunąć.
        </p>
      )}

      {colorInfo &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="label-color-info-popover"
            role="dialog"
            aria-label="Informacje o kolorze"
            className="fixed z-[10050] min-w-[220px] max-w-[min(92vw,280px)] rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 shadow-lg"
            style={{
              left: Math.min(
                Math.max(8, colorInfo.anchor.left),
                typeof window !== "undefined" ? window.innerWidth - 228 : colorInfo.anchor.left
              ),
              top: Math.min(
                colorInfo.anchor.bottom + 6,
                typeof window !== "undefined" ? window.innerHeight - 200 : colorInfo.anchor.bottom + 6
              ),
            }}
          >
            <p className="font-mono text-xs leading-relaxed">
              <span className="text-slate-500">Kolor:</span> {infoHexDisplay}
            </p>
            <p className="mt-1 font-mono text-xs leading-relaxed">
              <span className="text-slate-500">CMYK:</span> {infoCmyk}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">Wartości CMYK 0–100% (zgodnie z silnikiem etykiet PDF).</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => void copyHexToClipboard(colorInfo.hex)}
              >
                {copyFlash ? "Skopiowano" : "Kopiuj"}
              </button>
              <button
                type="button"
                className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                onClick={() => {
                  commit(colorInfo.hex);
                  closeColorInfo();
                }}
              >
                Zastosuj
              </button>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-slate-500 hover:text-slate-800"
                onClick={closeColorInfo}
              >
                Zamknij
              </button>
            </div>
          </div>,
          document.body
        )}

      {popover.open && popover.rect && (
        <ColorPickerPopover
          key={popover.mountKey}
          anchorRect={popover.rect}
          initialColor={popover.seed}
          fallback={fallback}
          onClose={closePopover}
          onApply={onApplyFromPopover}
        />
      )}
    </div>
  );
}
