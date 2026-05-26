/** Prefixy kodów kreskowych nośników magazynowych (WMS). */
export const WMS_CARRIER_BARCODE_PREFIXES = ["PAL-", "BOX-", "BIN-", "CRT-", "MIX-"] as const;

export function normalizeCarrierScan(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Normalizacja kodu nośnika (PAL-/BOX-/BIN-/CRT-/MIX-).
 * Prefiks LOC- traktowany jest przy skanowaniu jako lokalizacja — patrz ``classifyWmsScanCode``.
 */
export function normalizeCarrierBarcode(raw: string): string {
  return normalizeCarrierScan(raw);
}

/** Czy skan wygląda na kod nośnika (PAL-000123 itd.). */
export function looksLikeCarrierBarcode(raw: string): boolean {
  const s = normalizeCarrierScan(raw);
  if (!s) return false;
  return WMS_CARRIER_BARCODE_PREFIXES.some((p) => s.startsWith(p.toUpperCase()));
}
