/** Prefixy kodów kreskowych nośników magazynowych (WMS). */
export const WMS_CARRIER_BARCODE_PREFIXES = ["PAL-", "BOX-", "BIN-", "CRT-", "MIX-"] as const;

/** Canonical typed QR: ESP:carrier:{id} */
export const WMS_CARRIER_ESP_PREFIX = "ESP:CARRIER:";

export function normalizeCarrierScan(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Normalizacja kodu nośnika (PAL-/BOX-/BIN-/CRT-/MIX- lub ESP:carrier:).
 * Prefiks LOC- traktowany jest przy skanowaniu jako lokalizacja — patrz ``classifyWmsScanCode``.
 */
export function normalizeCarrierBarcode(raw: string): string {
  return normalizeCarrierScan(raw);
}

/** Typed ESP:carrier:{id} payload. */
export function looksLikeCarrierEspScan(raw: string): boolean {
  const s = normalizeCarrierScan(raw);
  return /^ESP:CARRIER:\d+$/i.test(s);
}

/** Czy skan wygląda na kod nośnika (ESP:carrier:* lub PAL-000123 itd.). */
export function looksLikeCarrierBarcode(raw: string): boolean {
  const s = normalizeCarrierScan(raw);
  if (!s) return false;
  if (looksLikeCarrierEspScan(s)) return true;
  return WMS_CARRIER_BARCODE_PREFIXES.some((p) => s.startsWith(p.toUpperCase()));
}

/** Canonical scan code from carrier id (mirrors backend carrier_scan_code). */
export function carrierScanCodeFromId(carrierId: number): string {
  return `ESP:carrier:${Number(carrierId)}`;
}
