/**
 * Shared picking validation resolver (settings UI + operator FE).
 * Keep logic aligned with backend `wms_picking_terminal_settings_service`.
 */

export type PickingTerminalScanPolicy = {
  requireProductScanAtLeastOnce: boolean;
  requireLocationScan: boolean;
  disableForceLocationScanWhenManyLocations: boolean;
  allowReserveLocationPicking: boolean;
  allowProductsWithoutEan: boolean;
};

export const DEFAULT_PICKING_TERMINAL_SCAN_POLICY: PickingTerminalScanPolicy = {
  requireProductScanAtLeastOnce: true,
  requireLocationScan: false,
  disableForceLocationScanWhenManyLocations: false,
  allowReserveLocationPicking: false,
  allowProductsWithoutEan: false,
};

/** When true, operator must scan a source location before confirming pick. */
export function computeNeedsLocationScan(opts: {
  locationCount: number;
  requireLocationScan: boolean;
  disableForceLocationScanWhenManyLocations: boolean;
}): boolean {
  if (opts.requireLocationScan) return true;
  if (opts.locationCount > 1 && !opts.disableForceLocationScanWhenManyLocations) return true;
  return false;
}

export function productHasScannableCode(codes: {
  ean?: string | null;
  sku?: string | null;
  barcode?: string | null;
  extraCodes?: Array<string | null | undefined> | null;
}): boolean {
  const parts = [
    codes.ean,
    codes.sku,
    codes.barcode,
    ...(codes.extraCodes ?? []),
  ];
  return parts.some((c) => String(c ?? "").trim().length > 0);
}

export function productMatchesScanCode(
  scan: string,
  codes: {
    ean?: string | null;
    sku?: string | null;
    barcode?: string | null;
    productId?: number | null;
    extraCodes?: Array<string | null | undefined> | null;
  },
  normalize: (raw: string) => string,
): boolean {
  const s = normalize(scan).toUpperCase();
  if (!s) return false;
  const cands = [
    codes.ean,
    codes.sku,
    codes.barcode,
    codes.productId != null ? String(codes.productId) : null,
    ...(codes.extraCodes ?? []),
  ]
    .filter(Boolean)
    .map((x) => normalize(String(x)).toUpperCase())
    .filter((x) => x.length > 0);
  return cands.some((c) => c === s || s.endsWith(c) || c.endsWith(s));
}

export type PickingValidationGates = {
  needsLocationScan: boolean;
  needsProductScan: boolean;
  productBlockedWithoutCode: boolean;
  allowManualProductConfirm: boolean;
  hasScannableProductCode: boolean;
};

/** Single resolver used across picking list / detail / qty confirm. */
export function resolvePickingValidationGates(opts: {
  locationCount: number;
  policy: PickingTerminalScanPolicy;
  hasScannableProductCode: boolean;
}): PickingValidationGates {
  const needsLocationScan = computeNeedsLocationScan({
    locationCount: opts.locationCount,
    requireLocationScan: opts.policy.requireLocationScan,
    disableForceLocationScanWhenManyLocations:
      opts.policy.disableForceLocationScanWhenManyLocations,
  });
  const hasCode = Boolean(opts.hasScannableProductCode);
  const allowNoEan = Boolean(opts.policy.allowProductsWithoutEan);
  const requireProd = Boolean(opts.policy.requireProductScanAtLeastOnce);
  const productBlockedWithoutCode = !hasCode && !allowNoEan;
  const allowManualProductConfirm = !hasCode && allowNoEan;
  const needsProductScan = Boolean(requireProd && hasCode);
  return {
    needsLocationScan,
    needsProductScan,
    productBlockedWithoutCode,
    allowManualProductConfirm,
    hasScannableProductCode: hasCode,
  };
}

/** Pick first routing location when location scan is not required (always set concrete source). */
export function resolveAutoSourceLocationId(opts: {
  needsLocationScan: boolean;
  locations: Array<{ location_id: number; stock_quantity?: number | null }>;
}): number | null {
  if (opts.needsLocationScan) return null;
  if (!opts.locations.length) return null;
  const withStock = opts.locations.find((l) => {
    const q = l.stock_quantity;
    return typeof q === "number" && Number.isFinite(q) ? q > 1e-9 : true;
  });
  return (withStock ?? opts.locations[0]).location_id;
}

export const PICKING_TERMINAL_SETTING_HINTS = {
  requireProductScanAtLeastOnce:
    "Operator musi zeskanować poprawny kod produktu przed potwierdzeniem pobrania.",
  requireLocationScan:
    "Przed pobraniem produktu operator musi zeskanować wskazaną lokalizację.",
  disableForceLocationScanWhenManyLocations:
    "Pozwala rozpocząć pobranie produktu z wielu lokalizacji bez obowiązkowego skanowania lokalizacji.",
  allowReserveLocationPicking:
    "Pozwala pobierać produkty również z lokalizacji oznaczonych jako rezerwowe.",
  allowProductsWithoutEan:
    "Pozwala obsługiwać w zbieraniu produkty, które nie mają przypisanego kodu EAN.",
} as const;
