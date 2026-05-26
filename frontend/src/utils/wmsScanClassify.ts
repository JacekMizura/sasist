import { normalizeScanEan } from "./wmsScanNormalize";

import { looksLikeCarrierBarcode } from "./carrierBarcode";

/** Klasyfikacja skanu dla routingu globalnego WMS (podgląd vs zbieranie). */
export type WmsScanKind = "ean_gtin" | "cart_like" | "location_like" | "carrier_barcode" | "generic";

/**
 * Heurystyka typu kodu — nie jest 100% pewna; w podglądzie produktu i tak próbujemy rozwiązać SKU.
 * - ean_gtin: same cyfry, typowe długości kodów kreskowych
 * - cart_like: prefiksy wózka
 * - location_like: wzorzec lokalizacji magazynowej (litery + cyfry / myślniki)
 */
export function classifyWmsScanCode(raw: string): WmsScanKind {
  const s = normalizeScanEan(raw);
  if (!s) return "generic";

  if (/^\d{8,20}$/.test(s)) return "ean_gtin";

  const up = s.toUpperCase();
  if (looksLikeCarrierBarcode(s)) return "carrier_barcode";

  if (up.startsWith("LOC-") || up.startsWith("LOC_")) return "location_like";

  if (/^CART[-_]/i.test(s) || up.startsWith("WÓZEK") || up.startsWith("WOZEK")) return "cart_like";

  if (/[A-Za-z]/.test(s) && /[0-9]/.test(s) && (s.includes("-") || s.includes("_") || /^[A-Z]{1,4}\d/.test(up))) {
    return "location_like";
  }

  return "generic";
}
