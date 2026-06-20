import type { CSSProperties } from "react";

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/** Default panel chip background (slate-500). */
export const DEFAULT_PANEL_STATUS_HEX = "#64748b";

export function isValidPanelStatusHex(value: string): boolean {
  return typeof value === "string" && HEX6.test(value.trim());
}

/** Normalize API value for display; unknown shapes fall back to default. */
export function normalizePanelStatusBg(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return DEFAULT_PANEL_STATUS_HEX;
  const s = raw.trim();
  return HEX6.test(s) ? s.toLowerCase() : DEFAULT_PANEL_STATUS_HEX;
}

function parseHexRgb(hex: string): [number, number, number] | null {
  const s = normalizePanelStatusBg(hex);
  if (!HEX6.test(s)) return null;
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance for sRGB hex. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHexRgb(hex);
  if (!rgb) return 0;
  const lin = rgb.map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Pick readable text on colored background. */
export function contrastingTextColor(hex: string): "#ffffff" | "#000000" {
  return relativeLuminance(hex) > 0.179 ? "#000000" : "#ffffff";
}

/** Symulacja koloru tła: tint RGBA na białym płótnie sidebara. */
export function blendHexOverWhite(hex: string, alpha: number): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return "#ffffff";
  const a = Math.min(1, Math.max(0, alpha));
  const mix = (c: number) => Math.round(255 * (1 - a) + c * a);
  const r = mix(rgb[0]);
  const g = mix(rgb[1]);
  const b = mix(rgb[2]);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Stosunek kontrastu WCAG (>= 4.5 zwykle „AA” dla małego tekstu). */
export function contrastRatio(hexFg: string, hexBg: string): number {
  const L1 = relativeLuminance(normalizePanelStatusBg(hexFg));
  const L2 = relativeLuminance(normalizePanelStatusBg(hexBg));
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Kolor etykiety statusu: używa wyboru użytkownika tylko gdy czytelny na tle;
 * w przeciwnym razie ciemny lub jasny neutralny wg jasności tła.
 */
export function pickReadableTextOnBackground(
  userTextHex: string | null | undefined,
  backgroundHexForContrast: string,
  minContrast = 4.2,
): string {
  const bg = normalizePanelStatusBg(backgroundHexForContrast);
  if (userTextHex && isValidPanelStatusHex(userTextHex)) {
    const u = userTextHex.trim().toLowerCase();
    if (contrastRatio(u, bg) >= minContrast) return u;
  }
  return relativeLuminance(bg) > 0.45 ? "#0f172a" : "#f8fafc";
}

/**
 * Jednolity neutralny licznik (sidebar panelu / nagłówki WMS): szare tło, bez gradientów
 * i kolorów statusu — kształt (np. rounded-md) ustawiają klasy Tailwind przy użyciu.
 */
export function neutralPanelCountBadgeStyle(): CSSProperties {
  return {
    backgroundColor: "#f1f5f9",
    color: "#334155",
    border: "1px solid rgba(148, 163, 184, 0.5)",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
    fontWeight: 600,
  };
}

/** @deprecated Nazwa historyczna — zwraca ten sam neutralny styl; argument `fillHex` jest ignorowany. */
export function premiumPanelCountBadgeStyleForBackgroundHex(_fillHex: string): CSSProperties {
  return neutralPanelCountBadgeStyle();
}

/** Inline styles for a pill/chip using stored hex as background. */
export function panelStatusChipStyle(hex: string | null | undefined): CSSProperties {
  const bg = normalizePanelStatusBg(hex);
  return {
    backgroundColor: bg,
    color: contrastingTextColor(bg),
    boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.12)",
  };
}

/** Podgląd w ustawieniach: pasek badge, tło, tekst (Sellasist-style). */
export function panelStatusRichPreviewStyle(args: {
  color: string;
  badge_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
}): CSSProperties {
  const stripe = normalizePanelStatusBg(args.badge_color ?? args.color);
  const bg = normalizePanelStatusBg(args.background_color ?? args.color);
  const txRaw = (args.text_color ?? "").trim();
  const tx = HEX6.test(txRaw) ? txRaw.toLowerCase() : "#0f172a";
  return {
    borderLeft: `4px solid ${stripe}`,
    backgroundColor: `${bg}33`,
    color: tx,
    boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.08)",
  };
}

/** Value for `<input type="color" />` (must be #rrggbb). */
export function hexForColorInput(raw: string | null | undefined): string {
  return normalizePanelStatusBg(raw);
}
