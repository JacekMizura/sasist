/**
 * Shared typography for new WMS mode views (picking / packing / collector).
 * Values come from warehouse „Ogólne” settings → CSS variables on the operator shell.
 */

export type WmsFontSizePx = 16 | 18 | 21;

export const WMS_FONT_SIZE_OPTIONS: Array<{ value: WmsFontSizePx; label: string }> = [
  { value: 16, label: "Mała — 16 px" },
  { value: 18, label: "Średnia (domyślna) — 18 px" },
  { value: 21, label: "Duża — 21 px" },
];

export const WMS_FONT_SIZE_DEFAULT_PX: WmsFontSizePx = 18;

export type WmsOperatorTypography = {
  fontSizeBasePx: WmsFontSizePx;
  fontSizeLocationPx: WmsFontSizePx;
  fontSizeQuantityPx: WmsFontSizePx;
};

export const DEFAULT_WMS_OPERATOR_TYPOGRAPHY: WmsOperatorTypography = {
  fontSizeBasePx: WMS_FONT_SIZE_DEFAULT_PX,
  fontSizeLocationPx: WMS_FONT_SIZE_DEFAULT_PX,
  fontSizeQuantityPx: WMS_FONT_SIZE_DEFAULT_PX,
};

/** CSS custom properties applied on the WMS operator root. */
export const WMS_TYPO_CSS_VARS = {
  base: "--wms-font-base",
  location: "--wms-font-location",
  quantity: "--wms-font-qty",
} as const;

export const WMS_GENERAL_SETTINGS_CHANGED_EVENT = "wms-general-settings-changed";

export function normalizeWmsFontSizePx(value: unknown): WmsFontSizePx {
  const n = Number(value);
  if (n === 16 || n === 18 || n === 21) return n;
  return WMS_FONT_SIZE_DEFAULT_PX;
}

export function typographyFromApi(row: {
  font_size_base_px?: number;
  font_size_location_px?: number;
  font_size_quantity_px?: number;
}): WmsOperatorTypography {
  return {
    fontSizeBasePx: normalizeWmsFontSizePx(row.font_size_base_px),
    fontSizeLocationPx: normalizeWmsFontSizePx(row.font_size_location_px),
    fontSizeQuantityPx: normalizeWmsFontSizePx(row.font_size_quantity_px),
  };
}

export function applyWmsTypographyCssVars(
  el: HTMLElement | null | undefined,
  typo: WmsOperatorTypography,
): void {
  if (!el) return;
  el.style.setProperty(WMS_TYPO_CSS_VARS.base, `${typo.fontSizeBasePx}px`);
  el.style.setProperty(WMS_TYPO_CSS_VARS.location, `${typo.fontSizeLocationPx}px`);
  el.style.setProperty(WMS_TYPO_CSS_VARS.quantity, `${typo.fontSizeQuantityPx}px`);
}

/**
 * Tailwind-friendly class fragments using CSS vars.
 * Prefer these over hardcoded text-xs / text-2xl on location & qty.
 */
export const wmsTypoClass = {
  /** Base text in new mode views — inherits from shell font-size when possible. */
  base: "text-[length:var(--wms-font-base,18px)]",
  location:
    "text-[length:var(--wms-font-location,18px)] leading-snug break-words [overflow-wrap:anywhere]",
  quantity: "text-[length:var(--wms-font-qty,18px)] tabular-nums leading-snug",
} as const;

export const WMS_GENERAL_SETTING_HINTS = {
  fontSizeBase:
    "Określa podstawową wielkość tekstów w nowych widokach trybów WMS. Wartość obowiązuje też na kolektorach — nie jest automatycznie zmniejszana na małym ekranie.",
  fontSizeLocation:
    "Określa wielkość tekstu lokalizacji produktu podczas pracy w nowych widokach WMS (np. A-01-02, RK-01/A2).",
  fontSizeQuantity:
    "Określa wielkość tekstu pokazującego ilość produktu podczas pracy w nowych widokach WMS (np. 5 szt., 12/20).",
} as const;
