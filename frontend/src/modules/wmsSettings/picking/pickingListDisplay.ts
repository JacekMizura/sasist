/**
 * Lista zbierania (`list_display`) — API/DB is SSOT.
 * localStorage must never seed, override, or POST these six fields.
 */
import {
  DEFAULT_WMS_PICKING_LIST_DISPLAY,
  type WmsPickingListDisplayApi,
} from "../../../api/wmsPickingTerminalSettingsApi";
import type { WmsPickingExtendedUiSettings } from "../../../types/wmsPickingExtendedUi";

export type PickingListCardVisibilityFromApi = {
  showProductImage: boolean;
  showEAN: boolean;
  showSKU: boolean;
  showCatalogNumber: boolean;
  showLocation: boolean;
  showWarehouseStock: boolean;
};

export const PICKING_LIST_DISPLAY_UI_KEYS = [
  "showProductImage",
  "showEAN",
  "showSKU",
  "showCatalogNumber",
  "showStock",
  "showLocation",
] as const;

export type PickingListDisplayUiKey = (typeof PICKING_LIST_DISPLAY_UI_KEYS)[number];

export const PICKING_LIST_DISPLAY_SECTION_HELP = {
  title: "Lista zbierania",
  description:
    "Określa, jakie informacje są widoczne na kartach produktów na liście zbierania. Ustawienia nie wpływają na ekran realizacji produktu.",
} as const;

export const PICKING_LIST_DISPLAY_HINTS = {
  showProductImage: "Pokazuje miniaturę produktu na karcie listy zbierania.",
  showEAN: "Pokazuje kod EAN produktu na karcie listy zbierania.",
  showSKU: "Pokazuje SKU produktu na karcie listy zbierania.",
  showCatalogNumber: "Pokazuje numer katalogowy produktu na karcie listy zbierania.",
  showStock:
    "Pokazuje łączny stan produktu w magazynie. Nie wpływa na ilość widoczną przy konkretnej lokalizacji.",
  showLocation: "Pokazuje lokalizację pobrania wraz z ilością dostępną w tej lokalizacji.",
} as const;

const LIST_DISPLAY_PLACEHOLDER: Pick<WmsPickingExtendedUiSettings, PickingListDisplayUiKey> = {
  showProductImage: DEFAULT_WMS_PICKING_LIST_DISPLAY.show_product_image,
  showEAN: DEFAULT_WMS_PICKING_LIST_DISPLAY.show_ean,
  showSKU: DEFAULT_WMS_PICKING_LIST_DISPLAY.show_sku,
  showCatalogNumber: DEFAULT_WMS_PICKING_LIST_DISPLAY.show_catalog_number,
  showStock: DEFAULT_WMS_PICKING_LIST_DISPLAY.show_stock,
  showLocation: DEFAULT_WMS_PICKING_LIST_DISPLAY.show_location,
};

export function stripListDisplayFromExtendedUi<T extends Partial<WmsPickingExtendedUiSettings>>(
  data: T,
): Omit<T, PickingListDisplayUiKey> {
  const next = { ...data };
  for (const key of PICKING_LIST_DISPLAY_UI_KEYS) {
    delete next[key];
  }
  return next;
}

/** In-memory form seed: UI prefs from cache, list flags from API defaults until GET. */
export function withListDisplayPlaceholder(
  data: Partial<WmsPickingExtendedUiSettings>,
): WmsPickingExtendedUiSettings {
  return {
    ...(data as WmsPickingExtendedUiSettings),
    ...LIST_DISPLAY_PLACEHOLDER,
  };
}

export function applyListDisplayToExtendedUi(
  prev: WmsPickingExtendedUiSettings,
  listDisplay: WmsPickingListDisplayApi,
): WmsPickingExtendedUiSettings {
  return {
    ...prev,
    showProductImage: Boolean(listDisplay.show_product_image),
    showEAN: Boolean(listDisplay.show_ean),
    showSKU: Boolean(listDisplay.show_sku),
    showCatalogNumber: Boolean(listDisplay.show_catalog_number),
    showStock: Boolean(listDisplay.show_stock),
    showLocation: Boolean(listDisplay.show_location),
  };
}

export function listDisplayFromExtendedUi(
  extended: Pick<WmsPickingExtendedUiSettings, PickingListDisplayUiKey>,
): WmsPickingListDisplayApi {
  return {
    show_product_image: Boolean(extended.showProductImage),
    show_ean: Boolean(extended.showEAN),
    show_sku: Boolean(extended.showSKU),
    show_catalog_number: Boolean(extended.showCatalogNumber),
    show_stock: Boolean(extended.showStock),
    show_location: Boolean(extended.showLocation),
  };
}

/** Omit `list_display` from POST when GET never succeeded — never write stale cache. */
export function listDisplayForTerminalSave(opts: {
  hydratedFromApi: boolean;
  extended: Pick<WmsPickingExtendedUiSettings, PickingListDisplayUiKey>;
}): WmsPickingListDisplayApi | undefined {
  if (!opts.hydratedFromApi) return undefined;
  return listDisplayFromExtendedUi(opts.extended);
}

export function pickingListCardVisibilityFromApi(
  listDisplay: WmsPickingListDisplayApi,
): PickingListCardVisibilityFromApi {
  return {
    showProductImage: Boolean(listDisplay.show_product_image),
    showEAN: Boolean(listDisplay.show_ean),
    showSKU: Boolean(listDisplay.show_sku),
    showCatalogNumber: Boolean(listDisplay.show_catalog_number),
    showLocation: Boolean(listDisplay.show_location),
    showWarehouseStock: Boolean(listDisplay.show_stock),
  };
}
