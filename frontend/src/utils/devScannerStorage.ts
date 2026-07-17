import { classifyWmsScanCode, type WmsScanKind } from "./wmsScanClassify";
import { normalizeScanEan } from "./wmsScanNormalize";

export type DevScannerObjectKind =
  | "cart"
  | "basket"
  | "product"
  | "location"
  | "carrier"
  | "order"
  | "other";

export const DEV_SCANNER_HISTORY_KEY = "dev_scanner_history_v2";
export const DEV_SCANNER_HISTORY_KEY_LEGACY = "dev_scanner_history";
export const DEV_SCANNER_FAVORITES_KEY = "dev_scanner_favorites";
export const DEV_SCANNER_DRAWER_OPEN_KEY = "dev_scanner_drawer_open";

export function loadDevScannerDrawerOpen(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(DEV_SCANNER_DRAWER_OPEN_KEY);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch {
    /* ignore */
  }
  return false;
}

export function saveDevScannerDrawerOpen(open: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DEV_SCANNER_DRAWER_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export type DevScanHistoryKind = DevScannerObjectKind;

export type DevScanHistoryEntry = {
  code: string;
  kind: DevScanHistoryKind;
  scannedAt: number;
  displayName?: string;
  productName?: string;
  productSku?: string | null;
  productEan?: string | null;
  productImageUrl?: string | null;
  locationLabel?: string;
  /** e.g. "Koszyk • WÓZ-001" */
  relationLabel?: string;
  parentCartCode?: string;
  parentCartName?: string;
};

export type DevScannerFavoriteKind = DevScannerObjectKind;

export type DevScannerFavorite = {
  id: string;
  kind: DevScannerFavoriteKind;
  code: string;
  label: string;
  productId?: number;
  imageUrl?: string | null;
  sku?: string | null;
  ean?: string | null;
  locationCode?: string;
  relationLabel?: string;
  parentCartCode?: string;
  parentCartName?: string;
  cartId?: number;
  pinnedAt: number;
};

const HISTORY_KINDS = new Set<string>([
  "product",
  "location",
  "carrier",
  "cart",
  "basket",
  "order",
  "other",
]);

export function scanKindToHistoryKind(kind: WmsScanKind): DevScanHistoryKind {
  if (kind === "ean_gtin") return "product";
  if (kind === "location_like") return "location";
  if (kind === "carrier_barcode") return "carrier";
  if (kind === "cart_like") return "cart";
  return "other";
}

export function favoriteId(kind: DevScannerFavoriteKind, code: string): string {
  return `${kind}:${normalizeScanEan(code)}`;
}

function parseHistoryEntry(raw: unknown): DevScanHistoryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const code = normalizeScanEan(String(o.code ?? ""));
  if (!code) return null;
  const kindRaw = String(o.kind ?? "");
  // legacy "carrier" covered carts historically
  let kind: DevScanHistoryKind;
  if (HISTORY_KINDS.has(kindRaw)) {
    kind = kindRaw as DevScanHistoryKind;
  } else {
    kind = scanKindToHistoryKind(classifyWmsScanCode(code));
  }
  // Legacy: carts were stored as carrier
  if (kind === "carrier" && classifyWmsScanCode(code) === "cart_like") {
    kind = "cart";
  }
  return {
    code,
    kind,
    scannedAt: typeof o.scannedAt === "number" ? o.scannedAt : Date.now(),
    displayName: typeof o.displayName === "string" ? o.displayName : undefined,
    productName: typeof o.productName === "string" ? o.productName : undefined,
    productSku: o.productSku != null ? String(o.productSku) : undefined,
    productEan: o.productEan != null ? String(o.productEan) : undefined,
    productImageUrl: typeof o.productImageUrl === "string" ? o.productImageUrl : undefined,
    locationLabel: typeof o.locationLabel === "string" ? o.locationLabel : undefined,
    relationLabel: typeof o.relationLabel === "string" ? o.relationLabel : undefined,
    parentCartCode: typeof o.parentCartCode === "string" ? o.parentCartCode : undefined,
    parentCartName: typeof o.parentCartName === "string" ? o.parentCartName : undefined,
  };
}

export function loadDevScannerHistory(cap: number): DevScanHistoryEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEV_SCANNER_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map(parseHistoryEntry)
          .filter((e): e is DevScanHistoryEntry => e != null)
          .slice(0, cap);
      }
    }
    const legacy = localStorage.getItem(DEV_SCANNER_HISTORY_KEY_LEGACY);
    if (!legacy) return [];
    const parsedLegacy = JSON.parse(legacy) as unknown;
    if (!Array.isArray(parsedLegacy)) return [];
    return parsedLegacy
      .map((x) => {
        const code = normalizeScanEan(String(x));
        if (!code) return null;
        return {
          code,
          kind: scanKindToHistoryKind(classifyWmsScanCode(code)),
          scannedAt: Date.now(),
        } satisfies DevScanHistoryEntry;
      })
      .filter((e): e is DevScanHistoryEntry => e != null)
      .slice(0, cap);
  } catch {
    return [];
  }
}

export function saveDevScannerHistory(entries: DevScanHistoryEntry[], cap: number) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DEV_SCANNER_HISTORY_KEY, JSON.stringify(entries.slice(0, cap)));
  } catch {
    /* ignore */
  }
}

export function loadDevScannerFavorites(): DevScannerFavorite[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEV_SCANNER_FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const o = x as Record<string, unknown>;
        const kindRaw = String(o.kind ?? "");
        const code = normalizeScanEan(String(o.code ?? ""));
        if (!code || !HISTORY_KINDS.has(kindRaw)) return null;
        const kind = kindRaw as DevScannerFavoriteKind;
        return {
          id: String(o.id ?? favoriteId(kind, code)),
          kind,
          code,
          label: String(o.label ?? code),
          productId: typeof o.productId === "number" ? o.productId : undefined,
          imageUrl: typeof o.imageUrl === "string" ? o.imageUrl : null,
          sku: o.sku != null ? String(o.sku) : null,
          ean: o.ean != null ? String(o.ean) : null,
          locationCode: typeof o.locationCode === "string" ? o.locationCode : undefined,
          relationLabel: typeof o.relationLabel === "string" ? o.relationLabel : undefined,
          parentCartCode: typeof o.parentCartCode === "string" ? o.parentCartCode : undefined,
          parentCartName: typeof o.parentCartName === "string" ? o.parentCartName : undefined,
          cartId: typeof o.cartId === "number" ? o.cartId : undefined,
          pinnedAt: typeof o.pinnedAt === "number" ? o.pinnedAt : Date.now(),
        } satisfies DevScannerFavorite;
      })
      .filter((f): f is DevScannerFavorite => f != null)
      .sort((a, b) => b.pinnedAt - a.pinnedAt);
  } catch {
    return [];
  }
}

export function saveDevScannerFavorites(favorites: DevScannerFavorite[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DEV_SCANNER_FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    /* ignore */
  }
}
