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
  "pages/documents/DocumentSeriesEditPage.tsx",
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
    const edit = files.find((f) => f.rel.endsWith("DocumentSeriesEditPage.tsx"));
    const modal = files.find((f) => f.rel.endsWith("DocumentSeriesQuickCreateModal.tsx"));
    expect(edit).toBeTruthy();
    expect(modal).toBeTruthy();
    for (const f of [edit!, modal!]) {
      expect(f.src, f.rel).toMatch(/\bFormField\b/);
      expect(f.src, f.rel).toMatch(/\bFORM_FIELD_DENSITY\b/);
      expect(f.src, f.rel).not.toMatch(/\binpSm\b/);
      expect(f.src, f.rel).not.toMatch(/mt-1 w-full rounded-md border border-slate-200 bg-white px-2/);
    }
    expect(edit!.src).toMatch(/\bFormSection\b/);
    expect(edit!.src).toMatch(/\bFormActions\b/);
    expect(edit!.src).toMatch(/\bPrimaryButton\b/);
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
