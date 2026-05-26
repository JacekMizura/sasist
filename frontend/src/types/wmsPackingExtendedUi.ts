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
/** Jak uruchamiane są czynności po pakowaniu — tylko UI (localStorage). */
export type PackingExecutionMode = "automatic" | "prepare_only" | "simulation";
export type PackingSalesDocumentType = "invoice" | "receipt" | "none";
export type PackingSingleOrMultiStrategy = "auto" | "single_first" | "multi_first";

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

  /** Co uruchamiać bez klikania — wyłączone sensownie przy ``prepare_only``. */
  executionMode: PackingExecutionMode;
  autoGenerateShipment: boolean;
  autoPrintShipment: boolean;
  autoCreateSalesDocument: boolean;
  autoPrintSalesDocument: boolean;
  autoChangeOrderStatus: boolean;
  afterActionsBehavior: PackingAfterActionsBehavior;

  salesDocumentType: PackingSalesDocumentType;
  skipA4ReceiptWhenFiscalPrinter: boolean;
  printCopyOfSalesDoc: boolean;

  forceScanShipmentTemplate: boolean;
  requireConfirmBeforeShipment: boolean;
  enableMultiParcel: boolean;
  autoFetchParcelCountDisabled: boolean;
  limitShipmentLabelsToQty: boolean;
  parcelLimitWithoutManagerConfirm: number;

  packerIsNotPicker: boolean;
  requireNotesPopup: boolean;
  showAllNotes: boolean;
  onlyPackagingWarehouseStock: boolean;
  restrictTemplatesToOrderAccount: boolean;

  goNextOrderAfterPacked: boolean;
  showAutomationButtons: boolean;
  replacementLabelTemplate: string;
  replacementLabelDelaySec: number;

  mainPackingWarehouse: string;
  fallbackLegacyTemplates: boolean;
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

  salesDocumentType: "invoice",
  skipA4ReceiptWhenFiscalPrinter: false,
  printCopyOfSalesDoc: false,

  forceScanShipmentTemplate: false,
  requireConfirmBeforeShipment: true,
  enableMultiParcel: false,
  autoFetchParcelCountDisabled: false,
  limitShipmentLabelsToQty: true,
  parcelLimitWithoutManagerConfirm: 5,

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
  packingSingleOrMultiItemStrategy: "auto",
};

export function storageKeyWmsPackingExtendedUi(warehouseId: number): string {
  return `wms-packing-extended-ui:v1:${warehouseId}`;
}

export function loadWmsPackingExtendedUi(warehouseId: number): WmsPackingExtendedUiSettings {
  try {
    const raw = localStorage.getItem(storageKeyWmsPackingExtendedUi(warehouseId));
    if (!raw) return { ...DEFAULT_WMS_PACKING_EXTENDED_UI };
    const parsed = JSON.parse(raw) as Partial<WmsPackingExtendedUiSettings>;
    return { ...DEFAULT_WMS_PACKING_EXTENDED_UI, ...parsed };
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
