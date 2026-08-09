import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import type { WmsPackingInterfaceDisplay } from "../../../types/wmsPackingSettings";
import { DEFAULT_WMS_PACKING_INTERFACE_DISPLAY } from "../../../types/wmsPackingSettings";

/** Wspólna widoczność pól produktu na ekranie pakowania (kafelki Active/Default/Done). */
export type PackingProductFieldVisibility = {
  show_stock: boolean;
  show_ean: boolean;
  show_symbol: boolean;
  show_catalog_number: boolean;
  show_signature: boolean;
  show_price: boolean;
  show_bundle_info: boolean;
  show_product_name: boolean;
  truncate_names: boolean;
  show_image: boolean;
  show_location: boolean;
};

export const DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY: PackingProductFieldVisibility = {
  show_stock: true,
  show_ean: true,
  show_symbol: true,
  show_catalog_number: true,
  show_signature: false,
  show_price: false,
  show_bundle_info: true,
  show_product_name: true,
  truncate_names: true,
  show_image: true,
  show_location: true,
};

export const PACKING_PRODUCT_NAME_MAX = 25;

/** Prezentacja nazwy — nie mutuje danych źródłowych. */
export function formatPackingProductName(
  raw: string | null | undefined,
  opts: { showName: boolean; truncate: boolean; qty?: number },
): string | null {
  if (!opts.showName) return null;
  const name = (raw ?? "").trim() || "—";
  const display =
    opts.truncate && name !== "—" && name.length > PACKING_PRODUCT_NAME_MAX
      ? `${name.slice(0, PACKING_PRODUCT_NAME_MAX)}…`
      : name;
  if (opts.qty != null && Number.isFinite(opts.qty)) {
    return `${opts.qty}x ${display}`;
  }
  return display;
}

export function buildPackingProductFieldVisibility(
  interfaceDisplay: WmsPackingInterfaceDisplay | null | undefined,
  extended: Pick<
    WmsPackingExtendedUiSettings,
    | "showSignature"
    | "showPrice"
    | "showBundleInfo"
    | "showProductNameDuringPacking"
    | "truncateLongNames"
    | "showProductImage"
    | "showProductLocation"
  > | null | undefined,
): PackingProductFieldVisibility {
  const iface = { ...DEFAULT_WMS_PACKING_INTERFACE_DISPLAY, ...(interfaceDisplay ?? {}) };
  return {
    show_stock: Boolean(iface.show_stock),
    show_ean: Boolean(iface.show_ean),
    show_symbol: Boolean(iface.show_symbol),
    show_catalog_number: Boolean(iface.show_catalog_number),
    show_signature: Boolean(extended?.showSignature),
    show_price: Boolean(extended?.showPrice),
    show_bundle_info: extended?.showBundleInfo !== false,
    show_product_name: extended?.showProductNameDuringPacking !== false,
    truncate_names: extended?.truncateLongNames !== false,
    show_image: extended?.showProductImage !== false,
    show_location: extended?.showProductLocation !== false,
  };
}

export function packingProductFieldVisibilityEqual(
  a: PackingProductFieldVisibility,
  b: PackingProductFieldVisibility,
): boolean {
  return (
    a.show_stock === b.show_stock &&
    a.show_ean === b.show_ean &&
    a.show_symbol === b.show_symbol &&
    a.show_catalog_number === b.show_catalog_number &&
    a.show_signature === b.show_signature &&
    a.show_price === b.show_price &&
    a.show_bundle_info === b.show_bundle_info &&
    a.show_product_name === b.show_product_name &&
    a.truncate_names === b.truncate_names &&
    a.show_image === b.show_image &&
    a.show_location === b.show_location
  );
}
