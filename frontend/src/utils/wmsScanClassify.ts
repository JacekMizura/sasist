import { normalizeScanEan } from "./wmsScanNormalize";

import { looksLikeCarrierBarcode } from "./carrierBarcode";

/** Klasyfikacja skanu dla routingu globalnego WMS (podgląd vs zbieranie). */
export type WmsScanKind =
  | "ean_gtin"
  | "cart_like"
  | "basket_like"
  | "location_like"
  | "carrier_barcode"
  | "generic";

/**
 * Heurystyka typu kodu — nie jest 100% pewna; w podglądzie produktu i tak próbujemy rozwiązać SKU.
 * - ean_gtin: same cyfry, typowe długości kodów kreskowych
 * - basket_like: koszyk na MULTI (brck1-B01, CART-…-B01, S-1-2) — przed location_like
 * - cart_like: prefiksy wózka
 * - location_like: wzorzec lokalizacji magazynowej (litery + cyfry / myślniki)
 */
export function classifyWmsScanCode(raw: string): WmsScanKind {
  const s = normalizeScanEan(raw);
  if (!s) return "generic";

  if (/^\d{8,20}$/.test(s)) return "ean_gtin";

  const up = s.toUpperCase();
  if (looksLikeCarrierBarcode(s)) return "carrier_barcode";

  // Basket before location: brck1-B01 was wrongly classified as location_like.
  if (/^S-\d+-\d+$/i.test(s) || /-B\d{1,3}$/i.test(s) || /^BRCK\d*[-_]B\d+/i.test(up)) {
    return "basket_like";
  }

  if (up.startsWith("LOC-") || up.startsWith("LOC_")) return "location_like";

  if (/^CART[-_]/i.test(s) || up.startsWith("WÓZEK") || up.startsWith("WOZEK")) {
    // CART-0002-B01 is a basket slot on a cart, not the cart itself.
    if (/-B\d{1,3}$/i.test(s)) return "basket_like";
    return "cart_like";
  }

  if (/[A-Za-z]/.test(s) && /[0-9]/.test(s) && (s.includes("-") || s.includes("_") || /^[A-Z]{1,4}\d/.test(up))) {
    return "location_like";
  }

  return "generic";
}
