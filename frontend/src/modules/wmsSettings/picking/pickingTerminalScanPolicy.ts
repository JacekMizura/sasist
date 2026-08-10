/**
 * Shared picking terminal scan policy helpers (settings UI + operator FE).
 */

export type PickingTerminalScanPolicy = {
  requireProductScanAtLeastOnce: boolean;
  requireLocationScan: boolean;
  disableForceLocationScanWhenManyLocations: boolean;
  allowReserveLocationPicking: boolean;
};

export const DEFAULT_PICKING_TERMINAL_SCAN_POLICY: PickingTerminalScanPolicy = {
  requireProductScanAtLeastOnce: true,
  requireLocationScan: false,
  disableForceLocationScanWhenManyLocations: false,
  allowReserveLocationPicking: false,
};

/** When true, operator must scan/select a source location before confirming pick. */
export function computeNeedsLocationScan(opts: {
  locationCount: number;
  requireLocationScan: boolean;
  disableForceLocationScanWhenManyLocations: boolean;
}): boolean {
  if (opts.requireLocationScan) return true;
  if (opts.locationCount > 1 && !opts.disableForceLocationScanWhenManyLocations) return true;
  return false;
}

export const PICKING_TERMINAL_SETTING_HINTS = {
  requireProductScanAtLeastOnce:
    "Operator musi zeskanować produkt co najmniej raz podczas jego zbierania. Samo ręczne potwierdzenie ilości nie wystarczy.",
  requireLocationScan:
    "Operator musi zeskanować kod lokalizacji przed potwierdzeniem pobrania produktu — także gdy produkt leży tylko w jednej lokalizacji.",
  disableForceLocationScanWhenManyLocations:
    "Gdy produkt leży w kilku lokalizacjach, wyłącza automatyczny wymóg skanu lokalizacji (domyślnie wymuszany przy wielu lokalizacjach). Nadal obowiązuje, jeśli włączono „Wymagane skanowanie lokalizacji”.",
  allowReserveLocationPicking:
    "Gdy wyłączone, lokalizacje rezerwowe/buforowe nie są dostępne do pobrania. Gdy włączone, operator może pobrać produkt z rezerwy zgodnie ze stanem.",
} as const;
