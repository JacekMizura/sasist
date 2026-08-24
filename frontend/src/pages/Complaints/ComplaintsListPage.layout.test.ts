import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

const PAGE = read("pages/Complaints/ComplaintsPanelPage.tsx");
const TOOLBAR = read("components/complaints/ComplaintsListToolbar.tsx");
const TABLE = read("components/complaints/ComplaintsListTable.tsx");
const BULK = read("components/complaints/ComplaintsListBulkBar.tsx");
const FILTERS = read("components/complaints/ComplaintListFiltersPanel.tsx");
const LAYOUT = read("pages/Complaints/ComplaintsLayout.tsx");
const RETURNS_TOOLBAR = read("components/returns/returnList/ReturnsListToolbar.tsx");
const RETURNS_TABLE = read("components/returns/returnList/ReturnsListTable.tsx");

describe("Complaints list aligns with Returns list SSOT", () => {
  it("uses ModuleListPageToolbar like Returns", () => {
    expect(TOOLBAR).toContain("ModuleListPageToolbar");
    expect(RETURNS_TOOLBAR).toContain("ModuleListPageToolbar");
    expect(TOOLBAR).toContain("brandPrimaryButtonClass");
    expect(TOOLBAR).toContain("Nowa reklamacja");
    expect(TOOLBAR).toContain("listSellasistToolbarToggleBtn");
    expect(TOOLBAR).toContain("WMS");
    expect(TOOLBAR).toContain("WMS_ROUTES.returns");
  });

  it("keeps embedded filter shell (Dodatkowe filtry / Pola filtrów via toolbar)", () => {
    expect(PAGE).toContain('filterLayout="embedded"');
    expect(FILTERS).toContain("ListFilterEmbeddedShell");
    expect(FILTERS).toContain("FilterVisibilityModal");
    expect(PAGE).toContain("openFilterFieldsRef");
    expect(PAGE).toContain("toggleFiltersPanel");
  });

  it("bulk bar reuses ModuleListBulkBar (no parallel toolbar)", () => {
    expect(BULK).toContain("ModuleListBulkBar");
    expect(BULK).toContain('placeholder="Wybierz akcję"');
    expect(BULK).toContain("showDelete");
    expect(PAGE).toContain("ComplaintsListBulkBar");
    expect(PAGE).not.toContain("onRefresh=");
  });

  it("table uses moduleList THEAD/TD/row tokens like Returns", () => {
    expect(TABLE).toContain("moduleListTheadClass");
    expect(TABLE).toContain("moduleListThClass");
    expect(TABLE).toContain("moduleListTdClass");
    expect(TABLE).toContain("moduleListRowClass");
    expect(TABLE).toContain("ModuleListStatusPill");
    expect(TABLE).toContain("ReturnsListProductCell");
    expect(TABLE).toContain("OperationalActionLink");
    expect(TABLE).toContain("OperationalActionButton");
    expect(RETURNS_TABLE).toContain("moduleListTheadClass");
  });

  it("DONE rows get archived tone analog to Returns", () => {
    expect(RETURNS_TABLE).toContain("RETURNS_LIST_ROW_ARCHIVED_CLASS");
    expect(TABLE).toContain("COMPLAINTS_LIST_ROW_DONE_CLASS");
    expect(TABLE).toContain("bg-emerald-50/40");
    expect(TABLE).toContain("uiTerminal");
  });

  it("pagination uses moduleTablePaginationFooterClass", () => {
    expect(PAGE).toContain("moduleTablePaginationFooterClass");
    expect(PAGE).toContain("complaints-list-pagination");
    expect(PAGE).toContain("Poprzednia");
    expect(PAGE).toContain("Ostatnia");
  });

  it("breadcrumb lives in layout (not duplicated under title as Lista)", () => {
    expect(LAYOUT).toContain("ModuleListBreadcrumb");
    expect(LAYOUT).toContain('label: "Reklamacje"');
    expect(PAGE).not.toContain("ModuleListBreadcrumb");
    expect(PAGE).not.toContain('label: "Lista"');
  });

  it("workspace and table test ids present for smoke structure", () => {
    expect(PAGE).toContain('data-testid="complaints-list-workspace"');
    expect(TABLE).toContain('data-testid="complaints-list-table"');
  });

  it("does not change Returns list implementation", () => {
    expect(RETURNS_TOOLBAR).toContain('title="Zwroty"');
    expect(RETURNS_TABLE).toContain("ReturnsListTableInner");
  });
});
