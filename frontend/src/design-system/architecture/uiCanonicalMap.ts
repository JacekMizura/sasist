/**
 * Sasist UI architecture — machine-readable canonical map (Phase A).
 * Consumed by `uiArchitecture.test.ts`. Prefer components over class strings in new code.
 */

export const UI_CANONICAL = {
  primaryButton: {
    component: "PrimaryButton",
    importFrom: "@/design-system",
    classAlias: ["primaryButtonClass", "brandPrimaryButtonClass", "filterToolbarBtnApply", "filterToolbarBtnPrimary"],
  },
  secondaryButton: {
    component: "SecondaryButton",
    importFrom: "@/design-system",
    classAlias: ["secondaryButtonClass", "filterToolbarBtnSecondary"],
  },
  ghostButton: {
    component: "GhostButton",
    importFrom: "@/design-system",
    classAlias: ["ghostButtonClass", "filterToolbarBtnGhost"],
  },
  dangerButton: {
    component: "DangerButton",
    importFrom: "@/design-system",
  },
  iconButton: {
    component: "IconButton",
    importFrom: "@/design-system",
  },
  rowActions: {
    component: "OperationalActionButton | OperationalActionLink | OperationalActionColumn",
    importFrom: "@/components/operational",
  },
  statusBadge: {
    component: "StatusBadge",
    importFrom: "@/design-system",
    listClassFacet: "@/components/operational/operationalSemanticBadges",
  },
  tableTokens: {
    moduleList: "@/components/listPage/moduleList",
    denseList: "@/components/listPage/listSellasistTokens",
  },
  paginationFooter: {
    token: "moduleTablePaginationFooterClass",
    importFrom: "@/components/listPage/moduleList",
  },
  pageSizeSelect: {
    component: "DataTablePageSizeSelect",
    importFrom: "@/components/table/DataTablePageSizeSelect",
  },
  listToolbar: {
    component: "ModuleListPageToolbar",
    importFrom: "@/components/listPage/moduleList",
  },
  dialog: {
    component: "Dialog",
    importFrom: "@/design-system",
  },
} as const;

/** Allowed legacy facade / token islands (Phase A inventory). New files matching *UiTokens must not appear. */
export const ALLOWED_LEGACY_UI_FACADES = [
  "components/filters/filterUiTokens.ts",
  "components/listPage/listSellasistTokens.ts",
  "modules/carts/wmsOperationalUi.ts",
  "modules/warehouseMaterials/warehouseMaterialsUi.ts",
  "modules/purchasing/ui/purchasingButtonTokens.ts",
  "components/settings/panelUiStatusSettingsStyles.ts",
  "design-system/brandUi.ts",
  "design-system/pageLayout.ts",
  "design-system/warehouseChrome.ts",
  // Documented debt — migrate in Phase B–D; do not add more of these.
  "components/operational/operationalActionButtonTokens.ts",
  "components/orders/automation/orderAutomationUiTokens.ts",
  "components/orders/orderDetailUiTokens.ts",
  "components/orders/orderMultiActions/uiTokens.ts",
  "components/products/productMultiActions/uiTokens.ts",
  "components/wms/picking/pickingUiTokens.ts",
] as const;
