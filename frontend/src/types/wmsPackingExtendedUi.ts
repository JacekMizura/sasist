/**
 * Ustawienia UI pakowania WMS — wyłącznie frontend (localStorage).
 * Backend PATCH pozostaje przy {@link WmsPackingSettingsRead}.
 */

/** Układ ekranu pakowania zamówienia — `with_sidebar` = lewy panel; `full_width` = bez sidebara. */
export type PackingLayoutMode = "with_sidebar" | "full_width";
export type PackingCustomerCommentStyle = "highlighted" | "normal";

/**
 * Normalizuje układ z localStorage.
 * Legacy (niepodłączone) wartości `"centered"` oraz stare `"full_width"` → `with_sidebar`,
 * o ile nie zapisano już schematu v2 (wtedy `"full_width"` oznacza nowy widok).
 */
export function normalizePackingLayoutMode(
  raw: unknown,
  schemaVersion: number | undefined,
): PackingLayoutMode {
  if (raw === "with_sidebar") return "with_sidebar";
  if (raw === "full_width" && (schemaVersion ?? 0) >= 2) return "full_width";
  return "with_sidebar";
}
export type PackingSalesDocPreview = "simplified" | "full";
export type PackingProductDisplayMode = "list" | "grid";
export type PackingLocationBadgePosition = "top_right" | "top_left" | "bottom_right" | "bottom_left";
export type PackingAutomationButtonsPosition = "bottom" | "right" | "floating";
export type PackingOrdersListLayout = "expanded_vertical" | "compact" | "cards";

/** Etykieta UI dla `ordersListLayout`. */
export function packingOrdersListLayoutLabel(layout: PackingOrdersListLayout): string {
  if (layout === "expanded_vertical") return "Rozbudowany (Pionowy)";
  if (layout === "cards") return "Rozbudowany (Poziomy)";
  return "Standardowy";
}
export type PackingAfterActionsBehavior = "return_to_list" | "next_order" | "stay_here";
/** Zachowane w localStorage — nie pokazywane w kanonicznym UI Sellasist. */
export type PackingExecutionMode = "automatic" | "prepare_only" | "simulation";
/** Paragon | Faktura | Pobrane z zamówienia. Legacy ``none`` → ``from_order``. */
export type PackingSalesDocumentType = "invoice" | "receipt" | "from_order";

export function normalizePackingSalesDocumentType(raw: unknown): PackingSalesDocumentType {
  if (raw === "invoice" || raw === "receipt") return raw;
  // legacy „Brak” / nieznane → pobrane z zamówienia
  return "from_order";
}

export function packingSalesDocumentTypeToApi(
  v: PackingSalesDocumentType,
): "FROM_ORDER" | "INVOICE" | "PARAGON" {
  if (v === "invoice") return "INVOICE";
  if (v === "receipt") return "PARAGON";
  return "FROM_ORDER";
}

export function packingSalesDocumentTypeFromApi(raw: unknown): PackingSalesDocumentType {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "INVOICE") return "invoice";
  if (s === "PARAGON") return "receipt";
  return "from_order";
}
/** @deprecated Prefer {@link WmsPackingExtendedUiSettings.packingBySingleOrMultiItemEnabled}. */
export type PackingSingleOrMultiStrategy = "auto" | "single_first" | "multi_first";
/** Akcja po wystawieniu dokumentu sprzedaży / listu przewozowego — tylko Wydrukuj / Pobierz. */
export type PackingPostDocumentAction = "print" | "download";

export function normalizePackingPostDocumentAction(raw: unknown): PackingPostDocumentAction {
  return raw === "download" ? "download" : "print";
}

export type WmsPackingExtendedUiSettings = {
  /** Wersja schematu układu (2 = Z sidebarem / Pełna szerokość). */
  packingLayoutSchemaVersion?: number;
  layoutMode: PackingLayoutMode;
  customerCommentStyle: PackingCustomerCommentStyle;
  salesDocumentPreview: PackingSalesDocPreview;
  packedProductsExtraList: boolean;
  productDisplayMode: PackingProductDisplayMode;
  showProductImage: boolean;
  showProductLocation: boolean;
  locationBadgePosition: PackingLocationBadgePosition;
  automationButtonsPosition: PackingAutomationButtonsPosition;

  movePackedToBottom: boolean;
  showSignature: boolean;
  showPrice: boolean;
  showBundleInfo: boolean;
  showProductNameDuringPacking: boolean;
  truncateLongNames: boolean;

  ordersListLayout: PackingOrdersListLayout;
  initialOrdersCount: number;
  showProductImageInOrders: boolean;
  showSKUInOrders: boolean;
  showEANInOrders: boolean;
  showCatalogNumberInOrders: boolean;
  truncateNamesInOrders: boolean;
  showPackedOrders: boolean;

  /** @deprecated SSOT = API ``allowed_start_status_ids``; kept as local mirror for migration. */
  allowedStartStatusIds: number[];

  /** Legacy localStorage — nie w kanonicznym UI. */
  executionMode: PackingExecutionMode;
  autoGenerateShipment: boolean;
  autoPrintShipment: boolean;
  autoCreateSalesDocument: boolean;
  autoPrintSalesDocument: boolean;
  autoChangeOrderStatus: boolean;
  /** Efekt po wykonaniu akcji automatycznych. */
  afterActionsBehavior: PackingAfterActionsBehavior;

  afterSalesDocumentAction: PackingPostDocumentAction;
  afterWaybillAction: PackingPostDocumentAction;

  salesDocumentType: PackingSalesDocumentType;
  skipA4ReceiptWhenFiscalPrinter: boolean;
  printCopyOfSalesDoc: boolean;

  /** Wybór liczby listów przewozowych do druku. */
  chooseWaybillPrintCount: boolean;
  forceScanShipmentTemplate: boolean;
  forceScanShipmentTemplateSelectedMethodsOnly: boolean;
  forceScanShipmentTemplateMethodIds: string[];
  requireConfirmBeforeShipment: boolean;
  enableMultiParcel: boolean;
  autoFetchParcelCountDisabled: boolean;
  limitShipmentLabelsToQty: boolean;
  parcelLimitWithoutManagerConfirm: number;

  blockExtraParcelsEnabled: boolean;
  blockExtraParcelsMethodIds: string[];

  packerIsNotPicker: boolean;
  requireNotesPopup: boolean;
  showAllNotes: boolean;
  onlyPackagingWarehouseStock: boolean;
  restrictTemplatesToOrderAccount: boolean;

  goNextOrderAfterPacked: boolean;
  showAutomationButtons: boolean;
  /** Legacy lokalny duplikat — UI używa fallback_label z API. */
  replacementLabelTemplate: string;
  replacementLabelDelaySec: number;

  /** @deprecated Server SSOT: TenantFulfillmentConfiguration.consolidation_warehouse_id (UI select). */
  mainPackingWarehouse: string;
  fallbackLegacyTemplates: boolean;
  /**
   * Gdy włączone — na ekranie trybu pakowania widać kafelki
   * „Zamówienia jednoelementowe” / „Zamówienia wieloelementowe”.
   */
  packingBySingleOrMultiItemEnabled: boolean;
  /** @deprecated Migracja z selecta — nie używane w UI. */
  packingSingleOrMultiItemStrategy: PackingSingleOrMultiStrategy;
};

export const DEFAULT_WMS_PACKING_EXTENDED_UI: WmsPackingExtendedUiSettings = {
  packingLayoutSchemaVersion: 2,
  layoutMode: "with_sidebar",
  customerCommentStyle: "normal",
  salesDocumentPreview: "simplified",
  packedProductsExtraList: false,
  productDisplayMode: "list",
  showProductImage: true,
  showProductLocation: true,
  locationBadgePosition: "top_right",
  automationButtonsPosition: "bottom",

  movePackedToBottom: true,
  showSignature: false,
  showPrice: false,
  showBundleInfo: true,
  showProductNameDuringPacking: true,
  truncateLongNames: true,

  ordersListLayout: "compact",
  initialOrdersCount: 25,
  showProductImageInOrders: true,
  showSKUInOrders: true,
  showEANInOrders: true,
  showCatalogNumberInOrders: false,
  truncateNamesInOrders: true,
  showPackedOrders: false,

  allowedStartStatusIds: [],

  executionMode: "automatic",
  autoGenerateShipment: false,
  autoPrintShipment: false,
  autoCreateSalesDocument: false,
  autoPrintSalesDocument: false,
  autoChangeOrderStatus: true,
  afterActionsBehavior: "stay_here",

  afterSalesDocumentAction: "print",
  afterWaybillAction: "print",

  salesDocumentType: "from_order",
  skipA4ReceiptWhenFiscalPrinter: false,
  printCopyOfSalesDoc: false,

  chooseWaybillPrintCount: false,
  forceScanShipmentTemplate: false,
  forceScanShipmentTemplateSelectedMethodsOnly: false,
  forceScanShipmentTemplateMethodIds: [],
  requireConfirmBeforeShipment: true,
  enableMultiParcel: false,
  autoFetchParcelCountDisabled: false,
  limitShipmentLabelsToQty: true,
  parcelLimitWithoutManagerConfirm: 5,

  blockExtraParcelsEnabled: false,
  blockExtraParcelsMethodIds: [],

  packerIsNotPicker: false,
  requireNotesPopup: false,
  showAllNotes: true,
  onlyPackagingWarehouseStock: true,
  restrictTemplatesToOrderAccount: false,

  goNextOrderAfterPacked: false,
  showAutomationButtons: true,
  replacementLabelTemplate: "",
  replacementLabelDelaySec: 2,

  mainPackingWarehouse: "",
  fallbackLegacyTemplates: false,
  packingBySingleOrMultiItemEnabled: false,
  packingSingleOrMultiItemStrategy: "auto",
};

export function storageKeyWmsPackingExtendedUi(warehouseId: number): string {
  return `wms-packing-extended-ui:v1:${warehouseId}`;
}

export function loadWmsPackingExtendedUi(warehouseId: number): WmsPackingExtendedUiSettings {
  try {
    const raw = localStorage.getItem(storageKeyWmsPackingExtendedUi(warehouseId));
    if (!raw) return { ...DEFAULT_WMS_PACKING_EXTENDED_UI };
    const parsed = JSON.parse(raw) as Partial<WmsPackingExtendedUiSettings> & {
      packingBySingleOrMultiItemEnabled?: boolean;
      packingSingleOrMultiItemStrategy?: PackingSingleOrMultiStrategy;
    };
    const legacyStrategy = parsed.packingSingleOrMultiItemStrategy;
    const enabledFromLegacy =
      legacyStrategy != null && legacyStrategy !== "auto" ? true : undefined;
    const schemaVersion =
      typeof parsed.packingLayoutSchemaVersion === "number" && Number.isFinite(parsed.packingLayoutSchemaVersion)
        ? parsed.packingLayoutSchemaVersion
        : 0;
    return {
      ...DEFAULT_WMS_PACKING_EXTENDED_UI,
      ...parsed,
      packingLayoutSchemaVersion: 2,
      layoutMode: normalizePackingLayoutMode(parsed.layoutMode, schemaVersion),
      packingBySingleOrMultiItemEnabled:
        typeof parsed.packingBySingleOrMultiItemEnabled === "boolean"
          ? parsed.packingBySingleOrMultiItemEnabled
          : (enabledFromLegacy ?? DEFAULT_WMS_PACKING_EXTENDED_UI.packingBySingleOrMultiItemEnabled),
      forceScanShipmentTemplateMethodIds: Array.isArray(parsed.forceScanShipmentTemplateMethodIds)
        ? parsed.forceScanShipmentTemplateMethodIds.map(String)
        : DEFAULT_WMS_PACKING_EXTENDED_UI.forceScanShipmentTemplateMethodIds,
      blockExtraParcelsMethodIds: Array.isArray(parsed.blockExtraParcelsMethodIds)
        ? parsed.blockExtraParcelsMethodIds.map(String)
        : DEFAULT_WMS_PACKING_EXTENDED_UI.blockExtraParcelsMethodIds,
      allowedStartStatusIds: Array.isArray(parsed.allowedStartStatusIds)
        ? parsed.allowedStartStatusIds.map(Number).filter((n) => Number.isFinite(n))
        : DEFAULT_WMS_PACKING_EXTENDED_UI.allowedStartStatusIds,
      afterSalesDocumentAction: normalizePackingPostDocumentAction(parsed.afterSalesDocumentAction),
      afterWaybillAction: normalizePackingPostDocumentAction(parsed.afterWaybillAction),
      salesDocumentType: normalizePackingSalesDocumentType(parsed.salesDocumentType),
    };
  } catch {
    return { ...DEFAULT_WMS_PACKING_EXTENDED_UI };
  }
}

export function saveWmsPackingExtendedUi(warehouseId: number, data: WmsPackingExtendedUiSettings): void {
  try {
    localStorage.setItem(
      storageKeyWmsPackingExtendedUi(warehouseId),
      JSON.stringify({ ...data, packingLayoutSchemaVersion: 2 }),
    );
  } catch {
    /* ignore */
  }
}

export function clearWmsPackingExtendedUi(warehouseId: number): void {
  try {
    localStorage.removeItem(storageKeyWmsPackingExtendedUi(warehouseId));
  } catch {
    /* ignore */
  }
}
