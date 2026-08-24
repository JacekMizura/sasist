import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { filterToolbarBtnApply, filterToolbarBtnPrimary } from "../../components/filters/filterUiTokens";
import { operationalBadgeBase } from "../../components/operational/operationalSemanticBadges";
import { primaryButtonClass, colors, radius } from "../index";
import { ALLOWED_LEGACY_UI_FACADES } from "./uiCanonicalMap";

const SRC_ROOT = path.resolve(__dirname, "../..");

/** Phase B migrated list modules — architecture guards apply here. */
const PHASE_B_LIST_GLOBS = [
  "pages/documents/WarehouseDocumentsTable.tsx",
  "pages/documents/DocumentsWarehousePage.tsx",
  "pages/documents/DocumentsSalesPage.tsx",
  "pages/documents/DocumentsCorrectingPage.tsx",
  "pages/documents/DocumentSeriesListPage.tsx",
  "pages/documents/documentsBadges.tsx",
  "pages/admin/MessageTemplatesModule.tsx",
  "pages/LabelSystem/templatesList/TemplateListRow.tsx",
  "pages/LabelSystem/templatesList/TemplateGridCard.tsx",
  "components/orders/automation/AutomationRulesTable.tsx",
  "pages/Orders/OrderAutomationListPage.tsx",
  "modules/inventoryCount/ui/erp/InventoryDocumentsView.tsx",
  "modules/inventoryCount/ui/erp/InventoryDocumentRowActions.tsx",
  "modules/inventoryCount/ui/erp/InventoryDocumentStatusBadge.tsx",
  "modules/inventoryCount/ui/erp/InventoryDashboardView.tsx",
  "pages/Assortment/categories/CategoryTreeRow.tsx",
  "pages/purchasing/PurchasingPoPage.tsx",
];

function readPhaseBFiles(): { rel: string; src: string }[] {
  return PHASE_B_LIST_GLOBS.map((rel) => {
    const full = path.join(SRC_ROOT, rel);
    if (!fs.existsSync(full)) return null;
    return { rel, src: fs.readFileSync(full, "utf8") };
  }).filter((x): x is { rel: string; src: string } => x != null);
}

/** Text action labels in Actions column (Polish UI). Allow title=/aria-label=. */
const TEXT_ACTION_IN_JSX =
  />\s*(Edytuj|Usuń|Otwórz|Podgląd|Duplikuj|Archiwizuj)\s*</;

const LOCAL_ROW_ACTION_BOX = /(?:className=["'`][^"'`]*\b)h-9\s+w-9\b/;

const LOCAL_BADGE_PILL =
  /rounded-full[^"'`\n]*px-2\.5[^"'`\n]*py-1[^"'`\n]*text-xs\s+font-semibold\s+ring-1/;

const LOCAL_PAGINATION_FOOTER =
  /flex items-center justify-between text-sm text-slate-600[\s\S]{0,200}Poprzednia/;

describe("UI architecture SSOT (Phase A)", () => {
  it("filter apply CTA is brand Primary (not amber)", () => {
    expect(filterToolbarBtnApply).toBe(primaryButtonClass);
    expect(filterToolbarBtnPrimary).toBe(primaryButtonClass);
    expect(filterToolbarBtnApply).not.toMatch(/bg-amber-600/);
    expect(filterToolbarBtnApply).toMatch(/bg-orange-500/);
  });

  it("primary color token is orange-500", () => {
    expect(colors.primary.bg).toBe("bg-orange-500");
  });

  it("operational badge geometry matches StatusBadge radius/scale", () => {
    expect(operationalBadgeBase).toContain(radius.sm);
    expect(operationalBadgeBase).toMatch(/text-xs/);
    expect(operationalBadgeBase).not.toMatch(/rounded-full/);
    expect(operationalBadgeBase).not.toMatch(/text-\[11px\]/);
  });

  it("does not introduce new *UiTokens islands outside allowlist", () => {
    const hits: string[] = [];
    const skipDirs = new Set(["node_modules", "dist", "__pycache__", ".git"]);

    function walk(dir: string) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skipDirs.has(ent.name)) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(ent.name)) continue;
        if (!/(?:UiTokens|ButtonTokens|MaterialsUi|OperationalUi|UiSkin|panelUiStatusSettingsStyles)\.(?:ts|tsx)$/i.test(ent.name)) {
          continue;
        }
        const rel = path.relative(SRC_ROOT, full).replace(/\\/g, "/");
        if (rel.includes("design-system/")) continue;
        if (ALLOWED_LEGACY_UI_FACADES.some((a) => rel.endsWith(a))) continue;
        hits.push(rel);
      }
    }

    walk(SRC_ROOT);
    expect(hits, `Unexpected UI token islands:\n${hits.join("\n")}`).toEqual([]);
  });
});

describe("UI architecture SSOT (Phase B list modules)", () => {
  const files = readPhaseBFiles();

  it("loads Phase B migrated list files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("does not use textual primary row actions in migrated list files", () => {
    const hits: string[] = [];
    for (const { rel, src } of files) {
      let scrubbed = src
        .replace(/\btitle=["'][^"']*["']/g, "")
        .replace(/\baria-label=["'][^"']*["']/g, "")
        // Overflow menus may keep Polish labels (rare/secondary).
        .replace(/role=["']menuitem["'][\s\S]*?<\/(?:button|a)>/g, "")
        // Same-file editors are out of Phase B list scope.
        .replace(/function TemplateEditorPage[\s\S]*/, "");
      if (TEXT_ACTION_IN_JSX.test(scrubbed)) hits.push(rel);
    }
    expect(hits, `Textual Actions labels:\n${hits.join("\n")}`).toEqual([]);
  });

  it("does not use local h-9 w-9 row action boxes in migrated list files", () => {
    const hits: string[] = [];
    for (const { rel, src } of files) {
      if (LOCAL_ROW_ACTION_BOX.test(src)) hits.push(rel);
    }
    expect(hits, `Local h-9 w-9 row actions:\n${hits.join("\n")}`).toEqual([]);
  });

  it("does not reintroduce rounded-full pill badge geometry in documentsBadges", () => {
    const badges = files.find((f) => f.rel.endsWith("documentsBadges.tsx"));
    expect(badges).toBeTruthy();
    expect(badges!.src).not.toMatch(LOCAL_BADGE_PILL);
    expect(badges!.src).toMatch(/StatusBadge/);
  });

  it("uses canonical pagination footer where warehouse docs paginate", () => {
    const page = files.find((f) => f.rel.endsWith("DocumentsWarehousePage.tsx"));
    expect(page).toBeTruthy();
    expect(page!.src).toMatch(/moduleTablePaginationFooterClass/);
    expect(page!.src).not.toMatch(LOCAL_PAGINATION_FOOTER);
  });

  it("warehouse documents table uses OperationalAction*", () => {
    const table = files.find((f) => f.rel.endsWith("WarehouseDocumentsTable.tsx"));
    expect(table).toBeTruthy();
    expect(table!.src).toMatch(/OperationalActionButton|OperationalActionColumn/);
    expect(table!.src).not.toMatch(/✏️|🗑|🖨|📋/);
  });

  it("does not hardcode ad-hoc orange primary button classes in Phase B list files", () => {
    const hits: string[] = [];
    for (const { rel, src } of files) {
      const matches = src.match(/className=["'`][^"'`]*\bbg-orange-[456]00\b[^"'`]*/g) ?? [];
      for (const m of matches) {
        if (/hover:bg-orange|hover:text-orange|text-orange|ring-orange|border-orange/.test(m) && !/\bbg-orange-[456]00\b/.test(m.replace(/hover:(?:bg|text)-orange-\d+/g, ""))) {
          continue;
        }
        hits.push(`${rel}: ${m.slice(0, 100)}`);
      }
    }
    expect(hits, `Hardcoded orange button fills:\n${hits.join("\n")}`).toEqual([]);
  });
});

/** Phase C Wave 1–2 form modules. */
const PHASE_C_FORM_GLOBS = [
  "design-system/components/Form.tsx",
  "modules/inventoryCount/ui/erp/InventoryWizardView.tsx",
  "modules/inventoryCount/ui/erp/InventoryCountWizardSteps.tsx",
  "pages/Assortment/families/FamilyEditInfoCard.tsx",
  "pages/Assortment/families/FamilyEditAttributesSection.tsx",
  "pages/Assortment/families/FamilyEditMembersCard.tsx",
  "pages/Assortment/categories/CategoryFormModal.tsx",
  "pages/Assortment/categories/CategoryEditBasicTab.tsx",
  "pages/Assortment/categories/CategoryEditNumberingTab.tsx",
  "pages/Assortment/PurchaseOrderEditPage.tsx",
  "pages/Assortment/SupplierEditPage.tsx",
  "pages/Assortment/ManufacturerEditPage.tsx",
  "pages/documents/components/seriesEditor/SaleDocumentSeriesEditorByTab.tsx",
  "pages/documents/components/WarehouseDocumentSeriesForm.tsx",
  "pages/documents/components/seriesEditor/DocumentSeriesEditorPanel.tsx",
  "components/orders/DocumentSeriesQuickCreateModal.tsx",
  "pages/documents/WarehouseDocumentDetailInfo.tsx",
  "pages/admin/MessageTemplatesModule.tsx",
  "pages/Settings/document-templates/DocumentTemplateCreatePage.tsx",
  "modules/companySettings/components/CompanyFormField.tsx",
  "modules/companySettings/views/CompanyProfileTab.tsx",
  "modules/companySettings/components/WarehouseDrawers.tsx",
  "modules/companySettings/components/TenantDrawers.tsx",
  "pages/Settings/AdministratorEditPage.tsx",
  "pages/Settings/administrators/LoginCodeLabelControls.tsx",
];

function readPhaseCFiles(): { rel: string; src: string }[] {
  return PHASE_C_FORM_GLOBS.map((rel) => {
    const full = path.join(SRC_ROOT, rel);
    if (!fs.existsSync(full)) return null;
    return { rel, src: fs.readFileSync(full, "utf8") };
  }).filter((x): x is { rel: string; src: string } => x != null);
}

const LOCAL_ERP_FIELD_IMPORT = /from\s+["'].*\/theme["'][\s\S]{0,200}\berpField(Input|Label)\b|import\s*\{[^}]*\berpField(Input|Label)\b/;
const LOCAL_FIELD_HEIGHT = /className=["'`][^"'`]*\bh-(7|8|11|12)\b[^"'`]*rounded-(md|lg)[^"'`]*border[^"'`]*px-3/;
const LOCAL_VIOLET_FOCUS = /focus:(?:border|ring)-violet-|ring-violet-500/;
const LOCAL_CHECKBOX_GEOM = /type=["']checkbox["'][^>]*className=["'][^"']*\bh-[45]\s+w-[45]\b/;

describe("UI architecture SSOT (Phase C form modules)", () => {
  const files = readPhaseCFiles();

  it("exports FormField composition primitives", () => {
    const form = files.find((f) => f.rel.endsWith("Form.tsx"));
    expect(form).toBeTruthy();
    expect(form!.src).toMatch(/export function FormField/);
    expect(form!.src).toMatch(/export function FormSection/);
    expect(form!.src).toMatch(/export function FormActions/);
    expect(form!.src).toMatch(/FORM_FIELD_DENSITY/);
  });

  it("inventory wizard uses Stepper + FormActions + Input", () => {
    const view = files.find((f) => f.rel.endsWith("InventoryWizardView.tsx"));
    expect(view).toBeTruthy();
    expect(view!.src).toMatch(/\bStepper\b/);
    expect(view!.src).toMatch(/\bFormActions\b/);
    expect(view!.src).toMatch(/\bInput\b/);
    expect(view!.src).not.toMatch(/tabsNavItemClassName/);
    expect(view!.src).not.toMatch(/\berpFieldInput\b/);
  });

  it("migrated Wave1 forms do not import erpFieldInput/Label", () => {
    const hits: string[] = [];
    for (const { rel, src } of files) {
      if (rel.includes("theme.ts")) continue;
      if (LOCAL_ERP_FIELD_IMPORT.test(src) || /\berpFieldInput\b|\berpFieldLabel\b/.test(src)) {
        hits.push(rel);
      }
    }
    expect(hits, `erpField* still used:\n${hits.join("\n")}`).toEqual([]);
  });

  it("migrated Wave1 forms do not use violet focus rings", () => {
    const hits = files.filter((f) => LOCAL_VIOLET_FOCUS.test(f.src)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("migrated Wave1 forms prefer FormSection over pimPanelClass", () => {
    const hits = files.filter((f) => /\bpimPanelClass\b/.test(f.src)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("does not invent oversized local input height recipes in Wave1 forms", () => {
    const hits: string[] = [];
    for (const { rel, src } of files) {
      if (LOCAL_FIELD_HEIGHT.test(src)) hits.push(rel);
    }
    expect(hits, `Local field height recipes:\n${hits.join("\n")}`).toEqual([]);
  });

  it("does not use custom large checkbox geometry in Wave1 forms", () => {
    const hits = files.filter((f) => LOCAL_CHECKBOX_GEOM.test(f.src)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("document series forms use FormField + FORM_FIELD_DENSITY without inpSm", () => {
    const sale = files.find((f) => f.rel.endsWith("SaleDocumentSeriesEditorByTab.tsx"));
    const warehouse = files.find((f) => f.rel.endsWith("WarehouseDocumentSeriesForm.tsx"));
    const panel = files.find((f) => f.rel.endsWith("DocumentSeriesEditorPanel.tsx"));
    const modal = files.find((f) => f.rel.endsWith("DocumentSeriesQuickCreateModal.tsx"));
    expect(sale).toBeTruthy();
    expect(warehouse).toBeTruthy();
    expect(panel).toBeTruthy();
    expect(modal).toBeTruthy();
    for (const f of [sale!, warehouse!, modal!]) {
      expect(f.src, f.rel).toMatch(/\bFormField\b/);
      expect(f.src, f.rel).toMatch(/\bFORM_FIELD_DENSITY\b/);
      expect(f.src, f.rel).not.toMatch(/\binpSm\b/);
      expect(f.src, f.rel).not.toMatch(/mt-1 w-full rounded-md border border-slate-200 bg-white px-2/);
    }
    expect(sale!.src).toMatch(/\bFormSection\b/);
    expect(panel!.src).toMatch(/\bFormActions\b/);
    expect(panel!.src).toMatch(/\bPrimaryButton\b/);
  });

  it("Wave 3 message templates editor does not use fieldInputClass", () => {
    const editor = files.find((f) => f.rel.endsWith("MessageTemplatesModule.tsx"));
    expect(editor).toBeTruthy();
    expect(editor!.src).not.toMatch(/\bfieldInputClass\b/);
    expect(editor!.src).toMatch(/\bFormField\b/);
    expect(editor!.src).toMatch(/\bFORM_FIELD_DENSITY\b/);
  });

  it("Wave 3 document template create does not use brandPrimaryButtonClass or local Field", () => {
    const page = files.find((f) => f.rel.endsWith("DocumentTemplateCreatePage.tsx"));
    expect(page).toBeTruthy();
    expect(page!.src).not.toMatch(/\bbrandPrimaryButtonClass\b/);
    expect(page!.src).not.toMatch(/function Field\(/);
    expect(page!.src).toMatch(/\bFormField\b/);
    expect(page!.src).toMatch(/\bPrimaryButton\b/);
  });

  it("Wave 3 administrator edit does not use sidebarInputCls or labelCls", () => {
    const page = files.find((f) => f.rel.endsWith("AdministratorEditPage.tsx"));
    expect(page).toBeTruthy();
    expect(page!.src).not.toMatch(/\bsidebarInputCls\b/);
    expect(page!.src).not.toMatch(/\blabelCls\b/);
    expect(page!.src).toMatch(/\bFormField\b/);
    expect(page!.src).toMatch(/\bFORM_FIELD_DENSITY\b/);
  });

  it("Wave 3 company profile uses FormField shim and FORM_FIELD_DENSITY inputs", () => {
    const tab = files.find((f) => f.rel.endsWith("CompanyProfileTab.tsx"));
    expect(tab).toBeTruthy();
    expect(tab!.src).not.toMatch(/\bcompanyInputClass\b/);
    expect(tab!.src).toMatch(/\bFORM_FIELD_DENSITY\b/);
    expect(tab!.src).toMatch(/\bPrimaryButton\b/);
  });
});

/**
 * Phase D1 — automation editor + admin forms (NOT list table; NOT WMS).
 * WMS paths are intentionally excluded from Phase D guards.
 */
const PHASE_D1_AUTOMATION_GLOBS = [
  "pages/Orders/OrderAutomationEditorPage.tsx",
  "components/orders/automation/AutomationManualTriggerSection.tsx",
  "components/orders/automation/AutomationExecutionSettingsSection.tsx",
  "components/orders/automation/AutomationConditionConfigFields.tsx",
  "components/orders/automation/effects/orderAutomationEffectEditorRenderers.tsx",
  "components/orders/automation/effects/GenerateDocumentEffectEditor.tsx",
  "components/orders/automation/AutomationModuleActivatorSettingsForm.tsx",
  "components/orders/automation/AutomationIfThenSection.tsx",
  "components/orders/automation/AutomationCategoryPickerModal.tsx",
  "pages/Orders/OrderAutomationGroupsPage.tsx",
  "pages/Orders/OrderAutomationLogsPage.tsx",
  "pages/Orders/OrderCustomFieldsListPage.tsx",
];

function readPhaseD1Files(): { rel: string; src: string }[] {
  return PHASE_D1_AUTOMATION_GLOBS.map((rel) => {
    const full = path.join(SRC_ROOT, rel);
    if (!fs.existsSync(full)) return null;
    return { rel, src: fs.readFileSync(full, "utf8") };
  }).filter((x): x is { rel: string; src: string } => x != null);
}

const FORBIDDEN_OA_FIELD_BTN = /\boaInp\b|\boaBtnPri\b|\boaBtnDanger\b|\boaBtn\b|\boaInpDense\b|\boaSearchInp\b|\boaLbl\b|\boaLblCaps\b/;

describe("UI architecture SSOT (Phase D1 automation editor)", () => {
  const files = readPhaseD1Files();

  it("loads Phase D1 automation editor files", () => {
    expect(files.length).toBe(PHASE_D1_AUTOMATION_GLOBS.length);
  });

  it("does not use forbidden oaInp / oaBtn* field tokens in Phase D1 files", () => {
    const hits: string[] = [];
    for (const { rel, src } of files) {
      if (FORBIDDEN_OA_FIELD_BTN.test(src)) hits.push(rel);
    }
    expect(hits, `Forbidden oa* field/button tokens:\n${hits.join("\n")}`).toEqual([]);
  });

  it("editor page uses PrimaryButton + Input (Form SSOT)", () => {
    const page = files.find((f) => f.rel.endsWith("OrderAutomationEditorPage.tsx"));
    expect(page).toBeTruthy();
    expect(page!.src).toMatch(/\bPrimaryButton\b/);
    expect(page!.src).toMatch(/\bInput\b/);
    expect(page!.src).toMatch(/\bFORM_FIELD_DENSITY\b/);
    expect(page!.src).toMatch(/\boaEditorHeaderCardClass\b/);
  });

  it("If/Then section keeps workflow layout tokens and uses PrimaryButton for finish-edit", () => {
    const section = files.find((f) => f.rel.endsWith("AutomationIfThenSection.tsx"));
    expect(section).toBeTruthy();
    expect(section!.src).toMatch(/\boaWorkflowLaneClass\b/);
    expect(section!.src).toMatch(/\bPrimaryButton\b/);
    expect(section!.src).not.toMatch(/\boaBtnPri\b/);
  });

  it("effect editor renderers use Select/Input without oaInp", () => {
    const effects = files.find((f) => f.rel.endsWith("orderAutomationEffectEditorRenderers.tsx"));
    expect(effects).toBeTruthy();
    expect(effects!.src).toMatch(/\bSelect\b/);
    expect(effects!.src).toMatch(/\bInput\b/);
    expect(effects!.src).toMatch(/\boaWorkflowFieldRowClass\b/);
    expect(effects!.src).not.toMatch(/\boaInp\b/);
  });
});

/**
 * Phase D2 — catalog/product/bundle forms + CreateOrderPage (NOT WMS).
 * WMS paths are intentionally excluded from Phase D guards.
 */
const PHASE_D2_CATALOG_FORM_GLOBS = [
  "components/catalog/CatalogEntityGallerySection.tsx",
  "components/catalog/productLikeTokens.ts",
  "pages/Assortment/BundleEditModal.tsx",
  "pages/Assortment/BundleLabelTab.tsx",
  "pages/Assortment/BundleProductSearch.tsx",
  "pages/Assortment/components/EntityPricingPanel.tsx",
  "pages/Assortment/components/BundleProductionPanel.tsx",
  "pages/Products/ProductEditLabelTab.tsx",
  "pages/Products/ProductEditSalesPackagingTab.tsx",
  "pages/CartsComponents/BulkCartEditor.tsx",
  "pages/CartsComponents/CartEditorMetaBar.tsx",
  "pages/CartsComponents/CartBasketEditDrawer.tsx",
  "pages/CartsComponents/CartRowAddToolbar.tsx",
  "pages/WarehouseMaterials/PackagingMaterialDetailPage.tsx",
  "pages/WarehouseMaterials/CartonDetailPage.tsx",
  "pages/Assortment/productCustomFields/ProductCustomFieldsPage.tsx",
  "pages/Orders/CreateOrderPage.tsx",
];

function readPhaseD2Files(): { rel: string; src: string }[] {
  return PHASE_D2_CATALOG_FORM_GLOBS.map((rel) => {
    const full = path.join(SRC_ROOT, rel);
    if (!fs.existsSync(full)) return null;
    return { rel, src: fs.readFileSync(full, "utf8") };
  }).filter((x): x is { rel: string; src: string } => x != null);
}

const FORBIDDEN_PRODUCT_LIKE_FIELD = /\bproductLikeInputClass\b|\bproductLikeFieldLabelClass\b/;
const LOCAL_SLATE_FORM_INPUT =
  /className=["'`][^"'`]*rounded-md border border-slate-200[^"'`]*px-3 py-2[^"'`]*(?:focus:border-blue|focus:ring-blue)/;

describe("UI architecture SSOT (Phase D2 catalog forms)", () => {
  const files = readPhaseD2Files();

  it("loads Phase D2 catalog form files", () => {
    expect(files.length).toBe(PHASE_D2_CATALOG_FORM_GLOBS.length);
  });

  it("does not use deprecated productLikeInputClass / productLikeFieldLabelClass in migrated files", () => {
    const hits: string[] = [];
    for (const { rel, src } of files) {
      if (rel.endsWith("productLikeTokens.ts")) continue;
      if (FORBIDDEN_PRODUCT_LIKE_FIELD.test(src)) hits.push(rel);
    }
    expect(hits, `productLike field tokens still used:\n${hits.join("\n")}`).toEqual([]);
  });

  it("migrated catalog forms use FormField + Input/Select (Form SSOT)", () => {
    const hits: string[] = [];
    for (const { rel, src } of files) {
      if (rel.endsWith("productLikeTokens.ts")) continue;
      // List/admin chrome — buttons + search only (no field forms on this page).
      if (rel.endsWith("ProductCustomFieldsPage.tsx")) continue;
      if (!/\bFormField\b/.test(src) || !/\b(Input|Select|Textarea|SearchInput)\b/.test(src)) {
        hits.push(rel);
      }
    }
    expect(hits, `Missing FormField/Input SSOT:\n${hits.join("\n")}`).toEqual([]);
  });

  it("CreateOrderPage uses PrimaryButton without brandPrimaryButtonClass", () => {
    const page = files.find((f) => f.rel.endsWith("CreateOrderPage.tsx"));
    expect(page).toBeTruthy();
    expect(page!.src).toMatch(/\bPrimaryButton\b/);
    expect(page!.src).toMatch(/\bFORM_FIELD_DENSITY\b/);
    expect(page!.src).not.toMatch(/\bbrandPrimaryButtonClass\b/);
  });

  it("ProductCustomFieldsPage does not use forbidden oaBtn* / oaSearchInp tokens", () => {
    const page = files.find((f) => f.rel.endsWith("ProductCustomFieldsPage.tsx"));
    expect(page).toBeTruthy();
    expect(page!.src).not.toMatch(FORBIDDEN_OA_FIELD_BTN);
    expect(page!.src).toMatch(/\bPrimaryButton\b/);
    expect(page!.src).toMatch(/\bSearchInput\b/);
  });

  it("productLikeTokens keeps layout chrome exports without deprecated field aliases", () => {
    const tokens = files.find((f) => f.rel.endsWith("productLikeTokens.ts"));
    expect(tokens).toBeTruthy();
    expect(tokens!.src).not.toMatch(/\bexport const productLikeInputClass\b/);
    expect(tokens!.src).not.toMatch(/\bexport const productLikeFieldLabelClass\b/);
    expect(tokens!.src).toMatch(/\bproductLikeStatCardClass\b/);
    expect(tokens!.src).toMatch(/\bproductLikeNumericInputNoSpinnerClass\b/);
  });

  it("does not reintroduce blue focus ring form recipes in Phase D2 files", () => {
    const hits: string[] = [];
    for (const { rel, src } of files) {
      if (rel.endsWith("productLikeTokens.ts")) continue;
      if (LOCAL_SLATE_FORM_INPUT.test(src) || /focus:ring-blue-500/.test(src)) hits.push(rel);
    }
    expect(hits, `Blue focus form recipes:\n${hits.join("\n")}`).toEqual([]);
  });
});

/**
 * Phase D3 — ERP Settings / configurators (NOT WMS).
 * WMS paths are intentionally excluded from Phase D guards.
 */
const PHASE_D3_SETTINGS_GLOBS = [
  "pages/Settings/OrderPanelUiStatusesSettingsPage.tsx",
  "pages/Settings/OrderPanelSubgroupsManager.tsx",
  "pages/Settings/ReturnPanelSubgroupsManager.tsx",
  "pages/Settings/ComplaintPanelUiStatusesSettingsPage.tsx",
  "pages/Settings/ExportEditorPage.tsx",
  "pages/Settings/returnsSettingsOps.tsx",
  "pages/Settings/ReturnsModuleSettingsPanel.tsx",
  "pages/Settings/StickySaveBar.tsx",
  "pages/Settings/ShippingMethodsSettingsPage.tsx",
  "pages/Settings/returnsStatusesConfigurator/ReturnUiStatusModal.tsx",
  "pages/Settings/returnsStatusesConfigurator/ReturnPanelSubgroupModal.tsx",
  "pages/Settings/returnsStatusesConfigurator/ProductDecisionsTableSection.tsx",
  "pages/Settings/returnsStatusesConfigurator/ProductDecisionsCardsSection.tsx",
  "pages/Settings/returnsStatusesConfigurator/DamageCardsSection.tsx",
  "pages/Settings/returnsStatusesConfigurator/RmzWorkflowProcessSection.tsx",
  "pages/Settings/returnsStatusesConfigurator/AdvancedSettingsPanel.tsx",
  "pages/Settings/returnsDictionariesConfigurator/DictionaryEntryModal.tsx",
];

function readPhaseD3Files(): { rel: string; src: string }[] {
  return PHASE_D3_SETTINGS_GLOBS.map((rel) => {
    const full = path.join(SRC_ROOT, rel);
    if (!fs.existsSync(full)) return null;
    return { rel, src: fs.readFileSync(full, "utf8") };
  }).filter((x): x is { rel: string; src: string } => x != null);
}

const FORBIDDEN_SETTINGS_PRIMARY = /\bbrandPrimaryButtonClass\b/;
const FORBIDDEN_LOCAL_INPUT_CONST =
  /\b(?:const|let|var)\s+(?:inp|inputClass|stInput|lab)\b\s*=/;

describe("UI architecture SSOT (Phase D3 settings configurators)", () => {
  const files = readPhaseD3Files();

  it("loads Phase D3 ERP settings files (WMS excluded)", () => {
    expect(files.length).toBe(PHASE_D3_SETTINGS_GLOBS.length);
    for (const { rel } of files) {
      expect(rel.toLowerCase()).not.toMatch(/\/wms|wmssettings|wmsproduction|wmspacking|wmsreturns|wmsoperational/i);
    }
  });

  it("does not use brandPrimaryButtonClass for primary CTAs in Phase D3 files", () => {
    const hits = files.filter((f) => FORBIDDEN_SETTINGS_PRIMARY.test(f.src)).map((f) => f.rel);
    expect(hits, `brandPrimaryButtonClass still used:\n${hits.join("\n")}`).toEqual([]);
  });

  it("does not use violet focus rings in Phase D3 settings files", () => {
    const hits = files.filter((f) => LOCAL_VIOLET_FOCUS.test(f.src)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("does not declare obvious local inputClass / inp / stInput constants in Phase D3 files", () => {
    const hits = files.filter((f) => FORBIDDEN_LOCAL_INPUT_CONST.test(f.src)).map((f) => f.rel);
    expect(hits, `Local input recipe constants:\n${hits.join("\n")}`).toEqual([]);
  });

  it("order / complaint / export forms use FormField + PrimaryButton (Form SSOT)", () => {
    const order = files.find((f) => f.rel.endsWith("OrderPanelUiStatusesSettingsPage.tsx"));
    const complaint = files.find((f) => f.rel.endsWith("ComplaintPanelUiStatusesSettingsPage.tsx"));
    const exportPage = files.find((f) => f.rel.endsWith("ExportEditorPage.tsx"));
    for (const f of [order!, complaint!, exportPage!]) {
      expect(f, f?.rel).toBeTruthy();
      expect(f.src, f.rel).toMatch(/\bFormField\b/);
      expect(f.src, f.rel).toMatch(/\bPrimaryButton\b/);
      expect(f.src, f.rel).toMatch(/\bFORM_FIELD_DENSITY\b/);
    }
  });

  it("return status modals use PrimaryButton + Input without brandPrimaryButtonClass", () => {
    const modal = files.find((f) => f.rel.endsWith("ReturnUiStatusModal.tsx"));
    expect(modal).toBeTruthy();
    expect(modal!.src).toMatch(/\bPrimaryButton\b/);
    expect(modal!.src).toMatch(/\bInput\b/);
    expect(modal!.src).not.toMatch(FORBIDDEN_SETTINGS_PRIMARY);
    expect(modal!.src).not.toMatch(/\bconst inp\b/);
  });
});

/**
 * Phase D cleanup — legacy ERP primitive facades removed (NOT WMS, NOT visual designers).
 */
const FORBIDDEN_LEGACY_OA_PRIMITIVE_EXPORT =
  /\bexport const oa(Inp|InpDense|SearchInp|Sel|Lbl|LblCaps|Btn|BtnPri|BtnGhost|BtnDanger|IconGhost|RowActionBtn)\b/;
const FORBIDDEN_LEGACY_PRODUCT_LIKE_EXPORT =
  /\bexport const (productLikeInputClass|productLikeFieldLabelClass|companyInputClass)\b/;

describe("UI architecture SSOT (Phase D legacy cleanup)", () => {
  it("orderAutomationUiTokens exports only specialized workflow tokens", () => {
    const filePath = path.join(SRC_ROOT, "components/orders/automation/orderAutomationUiTokens.ts");
    const src = fs.readFileSync(filePath, "utf8");
    expect(src).not.toMatch(FORBIDDEN_LEGACY_OA_PRIMITIVE_EXPORT);
    expect(src).toMatch(/\boaWorkflowLaneClass\b/);
    expect(src).toMatch(/\boaEditorHeaderCardClass\b/);
    expect(src).toMatch(/\boaLaunchTileClass\b/);
  });

  it("productLikeTokens does not export deprecated field class aliases", () => {
    const filePath = path.join(SRC_ROOT, "components/catalog/productLikeTokens.ts");
    const src = fs.readFileSync(filePath, "utf8");
    expect(src).not.toMatch(FORBIDDEN_LEGACY_PRODUCT_LIKE_EXPORT);
  });

  it("CompanyFormField does not re-export companyInputClass", () => {
    const filePath = path.join(SRC_ROOT, "modules/companySettings/components/CompanyFormField.tsx");
    const src = fs.readFileSync(filePath, "utf8");
    expect(src).not.toMatch(/\bcompanyInputClass\b/);
  });

  it("CustomersListPage does not import automation legacy button tokens", () => {
    const filePath = path.join(SRC_ROOT, "pages/customers/CustomersListPage.tsx");
    const src = fs.readFileSync(filePath, "utf8");
    expect(src).not.toMatch(/orderAutomationUiTokens/);
    expect(src).not.toMatch(FORBIDDEN_OA_FIELD_BTN);
    expect(src).not.toMatch(/\bbrandPrimaryButtonClass\b/);
    expect(src).toMatch(/\bDangerButton\b/);
    expect(src).toMatch(/\bSecondaryButton\b/);
  });

  it("PurchaseSalesBlockLinePanel uses Form SSOT without local inputClass", () => {
    const filePath = path.join(SRC_ROOT, "components/purchasing/PurchaseSalesBlockLinePanel.tsx");
    const src = fs.readFileSync(filePath, "utf8");
    expect(src).not.toMatch(/\binputClass\b/);
    expect(src).not.toMatch(/focus:ring-amber/);
    expect(src).toMatch(/\bFormField\b/);
    expect(src).toMatch(/\bFORM_FIELD_DENSITY\b/);
    expect(src).toMatch(/\bPrimaryButton\b/);
  });
});

/**
 * ERP table header SSOT — canonical moduleList* primitives (NOT WMS, NOT matrices/designers).
 */
const WMS_PATH_RE =
  /(?:^|\/)(?:pages\/wms|components\/wms|modules\/wms|modules\/inventoryCount\/ui\/wms|layout\/Wms|pages\/damage\/Wms|modules\/wmsSettings)/i;

const ERP_TABLE_HEADER_SPECIALIZED_ALLOWLIST = new Set([
  "components/settings/statusActionsMatrix/StatusActionsMatrix.tsx",
  "components/admin/UserPanelStatusMatrix.tsx",
  "pages/Settings/WmsOperationalOrderStatusMatrix.tsx",
  "pages/Settings/WorkforceStatusMatrixPage.tsx",
  "pages/Settings/ThreeDMatchingHistoryTable.tsx",
  "pages/Settings/SmartMatchingHistoryEventsTable.tsx",
  "components/products/ProductLocationDispositionMatrix.tsx",
  "pages/Assortment/components/EntityPricingPanel.tsx",
  "pages/Assortment/PurchaseOrderEditPage.tsx",
  "pages/Orders/CreateOrderPage.tsx",
  "pages/documents/WarehouseDocumentLinesSection.tsx",
  "pages/documents/WarehouseZPzDocumentDetail.tsx",
  "pages/LabelSystem/csvMapping/CsvMappingModal.tsx",
  "components/warehouse/carriers/CarrierItemsTable.tsx",
  "pages/Assortment/BundleProductsTab.tsx",
  "pages/Production/components/AssemblyComponentsTable.tsx",
  "pages/Settings/returnsStatusesConfigurator/ProductDecisionsCardsSection.tsx",
  "pages/Settings/returnsStatusesConfigurator/ProductDecisionsTableSection.tsx",
  "pages/Complaints/ComplaintDetailPage.tsx",
  "pages/Import/ImportPage.tsx",
  "components/orders/OrderSummaryProductsList.tsx",
  "pages/Products/ProductEditPricesTab.tsx",
  "pages/Products/ProductSalesOffersSection.tsx",
  "pages/Assortment/settings/AssortmentInventorySettingsPanel.tsx",
  "pages/Production/ProductManufacturingPanel.tsx",
  "pages/Production/ProductionOrderDetailPage.tsx",
  "pages/Orders/ReturnsReportPage.tsx",
  "pages/Import/ImportHistoryPage.tsx",
  "pages/zarzadzanie/KolejnoscDostawPage.tsx",
  "components/activityLog/ActivityLogTable.tsx",
  "pages/Settings/ExportsPage.tsx",
  "pages/Settings/WorkforceActivityPage.tsx",
  "pages/Settings/AdministratorEditPage.tsx",
  "pages/Assortment/SupplierEditPage.tsx",
  "pages/Assortment/ManufacturerEditPage.tsx",
  "pages/Assortment/categories/CategoryEditProductsTab.tsx",
  "pages/Assortment/families/FamilyEditMembersCard.tsx",
  "pages/Assortment/components/BundleProductionPanel.tsx",
  "pages/Production/ProductionShortagesPage.tsx",
  "pages/Production/components/DocumentMaterialReservationsPanel.tsx",
  "pages/Production/MaterialReservationsPage.tsx",
  "pages/Production/MaterialAnalysisPage.tsx",
  "pages/Production/components/ProductionDemandPlanningPanel.tsx",
  "pages/Products/ProductWarehouseMovementsPanel.tsx",
  "pages/Settings/EmployeeCostsOverviewPage.tsx",
  "pages/Settings/WorkforceDashboardPage.tsx",
  "pages/Orders/ReturnStatusesPage.tsx",
  "pages/Settings/WorkforceUserGroupsPage.tsx",
  "pages/Settings/AdministratorsAuditPage.tsx",
  "components/orders/automation/orderAutomationUiTokens.ts",
  "components/panelList/panelListDenseTableTokens.ts",
  "modules/purchasing/ui/purchasingTableTokens.ts",
  "components/listPage/listSellasistTokens.ts",
]);

const LOCAL_STICKY_ERP_TABLE_HEADER_RE =
  /<th[^>]*className=["'`][^"'`]*sticky\s+top-0[^"'`]*\bbg-white\b/;

const LOCAL_STICKY_HEADER_TOKEN_RE =
  /export const \w+Th\w*\s*=\s*["'`][^"'`]*sticky\s+top-0[^"'`]*\bbg-white\b/;

const LOCAL_THEAD_WHITE_RE = /<thead[^>]*className=["'`][^"'`]*\bbg-white\b/;

function walkErpSourceFiles(): string[] {
  const hits: string[] = [];
  const skipDirs = new Set(["node_modules", "dist", "__pycache__", ".git"]);
  function walk(dir: string) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipDirs.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(ent.name)) continue;
      const rel = path.relative(SRC_ROOT, full).replace(/\\/g, "/");
      if (WMS_PATH_RE.test(rel)) continue;
      if (rel.includes("LabelSystem/") && !rel.includes("templatesList")) continue;
      hits.push(rel);
    }
  }
  walk(SRC_ROOT);
  return hits;
}

function readListTableTokenFiles(): string[] {
  const hits: string[] = [];
  const skipDirs = new Set(["node_modules", "dist", "__pycache__", ".git"]);
  function walk(dir: string) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipDirs.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ent.name.endsWith("ListTableTokens.ts")) continue;
      hits.push(path.relative(SRC_ROOT, full).replace(/\\/g, "/"));
    }
  }
  walk(SRC_ROOT);
  return hits;
}

describe("UI architecture SSOT (ERP table header)", () => {
  it("moduleListTheadClass uses slate-50 header chrome like Documents", () => {
    const tokensPath = path.join(SRC_ROOT, "components/listPage/moduleList/moduleListTableTokens.ts");
    const src = fs.readFileSync(tokensPath, "utf8");
    expect(src).toMatch(/moduleListTheadClass\s*=\s*["'`][^"'`]*bg-slate-50/);
    expect(src).toMatch(/moduleListStickyThClass[\s\S]*bg-slate-50/);
    expect(src).not.toMatch(/moduleListTheadClass\s*=\s*["'`][^"'`]*bg-white/);
  });

  it("ListTableTokens files import sticky header geometry from moduleList SSOT", () => {
    const hits: string[] = [];
    for (const rel of readListTableTokenFiles()) {
      if (rel.endsWith("moduleList/moduleListTableTokens.ts")) continue;
      if (rel.endsWith("packagingList/packagingListTableTokens.ts")) continue;
      const src = fs.readFileSync(path.join(SRC_ROOT, rel), "utf8");
      if (!/ListThClass|ThClass/.test(src)) continue;
      if (!src.includes("moduleListTableTokens") && !src.includes("moduleListSticky")) {
        hits.push(rel);
      }
      if (LOCAL_STICKY_HEADER_TOKEN_RE.test(src)) {
        hits.push(`${rel} (local sticky bg-white header)`);
      }
    }
    expect(hits, `ListTableTokens not on moduleList SSOT:\n${hits.join("\n")}`).toEqual([]);
  });

  it("ERP list tables do not duplicate white sticky header recipes outside allowlist", () => {
    const hits: string[] = [];
    for (const rel of walkErpSourceFiles()) {
      if (ERP_TABLE_HEADER_SPECIALIZED_ALLOWLIST.has(rel)) continue;
      const src = fs.readFileSync(path.join(SRC_ROOT, rel), "utf8");
      if (LOCAL_THEAD_WHITE_RE.test(src)) {
        hits.push(`${rel}: thead bg-white`);
      }
      if (LOCAL_STICKY_ERP_TABLE_HEADER_RE.test(src)) {
        hits.push(`${rel}: sticky header bg-white`);
      }
    }
    expect(hits, `Local ERP table headers:\n${hits.join("\n")}`).toEqual([]);
  });

  it("AdminDataTable uses moduleListTheadClass", () => {
    const src = fs.readFileSync(path.join(SRC_ROOT, "components/admin/AdminDataTable.tsx"), "utf8");
    expect(src).toMatch(/\bmoduleListTheadClass\b/);
    expect(src).not.toMatch(/<tr className="border-b border-slate-200 bg-white"/);
  });

  it("moduleListThClass list tables pair with moduleListTheadClass on thead", () => {
    const hits: string[] = [];
    const skipDirs = new Set(["node_modules", "dist", "__pycache__", ".git"]);
    function walk(dir: string) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skipDirs.has(ent.name)) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx$/.test(ent.name)) continue;
        const rel = path.relative(SRC_ROOT, full).replace(/\\/g, "/");
        if (WMS_PATH_RE.test(rel)) continue;
        const src = fs.readFileSync(full, "utf8");
        if (!src.includes("moduleListThClass")) continue;
        if (!src.includes("<thead")) continue;
        if (src.includes("moduleListTheadClass") || src.includes("PurchasingTableHeader")) continue;
        hits.push(rel);
      }
    }
    walk(SRC_ROOT);
    expect(hits, `moduleListTh without moduleListThead:\n${hits.join("\n")}`).toEqual([]);
  });
});

describe("UI architecture SSOT (ERP global sidebar)", () => {
  it("erpSidebarStyles defines widened icon-rail geometry", () => {
    const filePath = path.join(SRC_ROOT, "layout/erpSidebarStyles.ts");
    const src = fs.readFileSync(filePath, "utf8");
    expect(src).toMatch(/ERP_SIDEBAR_COLLAPSED_WIDTH_PX\s*=\s*104/);
    expect(src).toMatch(/ERP_SIDEBAR_WIDTH_PX\s*=\s*252/);
    expect(src).toMatch(/h-6 w-6/);
    expect(src).toMatch(/text-\[11px\]/);
    expect(src).not.toMatch(/ERP_SIDEBAR_COLLAPSED_WIDTH_PX\s*=\s*80/);
  });

  it("ErpSidebar consumes erpSidebarStyles tokens (no local WMS button geometry)", () => {
    const src = fs.readFileSync(path.join(SRC_ROOT, "layout/ErpSidebar.tsx"), "utf8");
    expect(src).toMatch(/\berpSidebarWmsCollapsedClassName\b/);
    expect(src).toMatch(/\bERP_SIDEBAR_WMS_EXPANDED_CLASS\b/);
    expect(src).not.toMatch(/max-w-\[4\.25rem\]/);
  });
});
