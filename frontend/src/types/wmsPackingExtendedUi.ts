/**
 * Ustawienia UI pakowania WMS — wyłącznie frontend (localStorage).
 * Backend PATCH pozostaje przy {@link WmsPackingSettingsRead}.
 */

export type PackingLayoutMode = "full_width" | "centered";
export type PackingCustomerCommentStyle = "highlighted" | "normal";
export type PackingSalesDocPreview = "simplified" | "full";
export type PackingProductDisplayMode = "list" | "grid";
export type PackingLocationBadgePosition = "top_right" | "top_left" | "bottom_right" | "bottom_left";
export type PackingAutomationButtonsPosition = "bottom" | "right" | "floating";
export type PackingOrdersListLayout = "expanded_vertical" | "compact" | "cards";
export type PackingAfterActionsBehavior = "return_to_list" | "next_order" | "stay_here";
/** Zachowane w localStorage — nie pokazywane w kanonicznym UI Sellasist. */
export type PackingExecutionMode = "automatic" | "prepare_only" | "simulation";
export type PackingSalesDocumentType = "invoice" | "receipt" | "none";
/** @deprecated Prefer {@link WmsPackingExtendedUiSettings.packingBySingleOrMultiItemEnabled}. */
export type PackingSingleOrMultiStrategy = "auto" | "single_first" | "multi_first";
export type PackingPostDocumentAction = "none" | "print" | "download" | "open";

export type WmsPackingExtendedUiSettings = {
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
  layoutMode: "full_width",
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
  showPackedOrders: true,

  allowedStartStatusIds: [],

  executionMode: "automatic",
  autoGenerateShipment: false,
  autoPrintShipment: false,
  autoCreateSalesDocument: false,
  autoPrintSalesDocument: false,
  autoChangeOrderStatus: true,
  afterActionsBehavior: "stay_here",

  afterSalesDocumentAction: "none",
  afterWaybillAction: "none",

  salesDocumentType: "invoice",
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
    return {
      ...DEFAULT_WMS_PACKING_EXTENDED_UI,
      ...parsed,
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
    };
  } catch {
    return { ...DEFAULT_WMS_PACKING_EXTENDED_UI };
  }
}

export function saveWmsPackingExtendedUi(warehouseId: number, data: WmsPackingExtendedUiSettings): void {
  try {
    localStorage.setItem(storageKeyWmsPackingExtendedUi(warehouseId), JSON.stringify(data));
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
