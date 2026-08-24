import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DOCUMENT_SERIES_EDITOR_TABS } from "./documentSeriesEditorTypes";
import { warehouseCapabilitiesFor } from "./warehouseSeriesCapabilities";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(path.join(HERE, rel), "utf8");
}

const LIST = read("DocumentSeriesListPage.tsx");
const PANEL = read("components/seriesEditor/DocumentSeriesEditorPanel.tsx");
const SALE = read("components/seriesEditor/SaleDocumentSeriesEditorByTab.tsx");
const WH = read("components/WarehouseDocumentSeriesForm.tsx");
const HOOK = read("hooks/useDocumentSeriesEditor.ts");
const APP = readFileSync(path.join(HERE, "../../App.tsx"), "utf8");

describe("DocumentSeries split-pane workspace", () => {
  it("keeps list pane mounted and opens editor beside it (no full-page editor route)", () => {
    expect(LIST).toContain('data-testid="document-series-list-pane"');
    expect(LIST).toContain('data-testid="document-series-editor-pane"');
    expect(LIST).toContain("DocumentSeriesEditorPanel");
    expect(LIST).toContain("parseSeriesRoute");
    expect(APP).toContain('path="series/*"');
    expect(APP).toContain("DocumentSeriesListPage");
    expect(APP).not.toMatch(/path="series\/new".*DocumentSeriesEditPage/);
  });

  it("clicking series name or edit opens right panel via route", () => {
    expect(LIST).toContain("openEdit");
    expect(LIST).toContain("document-series-open-");
    expect(LIST).toContain("/documents/series/${r.id}");
    expect(LIST).toContain('title="Edytuj serię"');
  });

  it("table remains visible when editor is open", () => {
    expect(LIST).toContain('data-testid="document-series-table"');
    expect(LIST).toContain("route.editorOpen");
    expect(LIST).not.toContain("drawer");
    expect(LIST).not.toMatch(/\bModal\b|\bDialog\b/);
  });

  it("X closes editor panel", () => {
    expect(PANEL).toContain('data-testid="document-series-editor-close"');
    expect(PANEL).toContain("onClose");
    expect(LIST).toContain("closeEditor");
    expect(LIST).toContain('navigate("/documents/series")');
  });

  it("create opens panel in create mode", () => {
    expect(LIST).toContain('data-testid="document-series-create"');
    expect(LIST).toContain('navigate("/documents/series/new")');
    expect(LIST).toContain("isCreate={route.isCreate}");
    expect(PANEL).toContain("isCreate");
    expect(HOOK).toContain("if (isCreate)");
  });

  it("tabs switch sections without rendering whole form at once", () => {
    expect(DOCUMENT_SERIES_EDITOR_TABS.map((t) => t.id)).toEqual([
      "basics",
      "document",
      "numbering",
      "automation",
      "company",
    ]);
    expect(PANEL).toContain("activeTab");
    expect(PANEL).toContain("document-series-tab-");
    expect(SALE).toContain('if (activeTab === "basics")');
    expect(SALE).toContain('if (activeTab === "document")');
    expect(SALE).toContain('if (activeTab === "numbering")');
    expect(SALE).toContain('if (activeTab === "automation")');
    expect(WH).toContain("activeTab");
    expect(WH).toContain('show("basics")');
  });

  it("save uses existing create/update API and keeps panel open", () => {
    expect(HOOK).toContain("createDocumentSeries");
    expect(HOOK).toContain("updateDocumentSeries");
    expect(HOOK).toContain('onSaved(created, "create")');
    expect(HOOK).toContain('onSaved(updated, "update")');
    expect(LIST).toContain("onEditorSaved");
    expect(LIST).toContain("refreshListQuiet");
    expect(LIST).toContain("documents/series/${saved.id}");
  });

  it("cancel restores baseline without closing panel", () => {
    expect(HOOK).toContain("setDraft(cloneDocumentSeriesWrite(baseline))");
    expect(PANEL).toContain("editor.cancel");
    expect(PANEL).toContain('data-testid="document-series-editor-cancel"');
  });

  it("WAREHOUSE hides SALE-only fields via capabilities", () => {
    expect(PANEL).toContain("visibleEditorTabs");
    expect(PANEL).toContain("warehouseCapabilitiesFor");
    expect(WH).toContain("show_print_template_preset");
    expect(WH).toContain("show_document_template");
    expect(WH).not.toContain("vat_source");
    expect(WH).not.toContain("company_nip");
    expect(WH).not.toContain("status_on_create_id");
  });

  it("RZ/WZ respect warehouseSeriesCapabilities", () => {
    const wz = warehouseCapabilitiesFor("WZ");
    const rz = warehouseCapabilitiesFor("RESERVATION");
    expect(wz?.show_print_template_preset).toBe(true);
    expect(wz?.show_company_block).toBe(false);
    expect(rz?.show_print_template_preset).toBe(false);
    expect(rz?.show_document_template).toBe(false);
    expect(rz?.physical_effect).toBe(false);
  });

  it("SALE shows VAT and company data on company tab", () => {
    expect(SALE).toContain("Źródło VAT");
    expect(SALE).toContain("company_nip");
    expect(SALE).toContain("company_iban");
    expect(SALE).toContain("Wczytaj z profilu firmy");
  });

  it("readback uses getDocumentSeries into draft", () => {
    expect(HOOK).toContain("getDocumentSeries");
    expect(HOOK).toContain("documentSeriesDtoToWrite");
    expect(HOOK).toContain("setBaseline");
  });

  it("list regression: bulk actions, KPI, icon edit/delete", () => {
    expect(LIST).toContain("Zaznacz wszystkie");
    expect(LIST).toContain("Usuń zaznaczone");
    expect(LIST).toContain("DocumentsKpiRow");
    expect(LIST).toContain("OperationalActionButton");
    expect(LIST).toContain("OperationalActionLink");
    expect(LIST).toContain("<Pencil");
    expect(LIST).toContain("<Trash2");
    expect(LIST).toContain("window.confirm");
    expect(LIST).toContain("onDeleteOne");
  });

  it("automation tab documents status_on_* are not document triggers", () => {
    expect(SALE).toContain("Nie są triggerem utworzenia");
    expect(SALE).toContain("status_on_create_id");
    expect(DOCUMENT_SERIES_EDITOR_TABS.some((t) => t.label === "Automatyzacja")).toBe(true);
    expect(PANEL).toContain("DOCUMENT_SERIES_EDITOR_TABS");
  });
});

describe("DocumentSeriesListPage actions", () => {
  it("uses icon buttons with tooltips — no Edytuj/Usuń text in actions column", () => {
    expect(LIST).toContain("OperationalActionButton");
    expect(LIST).toContain("OperationalActionLink");
    expect(LIST).toContain('title="Edytuj serię"');
    expect(LIST).toContain('title="Usuń serię"');
    expect(LIST).toContain("<Pencil");
    expect(LIST).toContain("<Trash2");
    expect(LIST).not.toMatch(/>\s*Edytuj\s*</);
    expect(LIST).not.toMatch(/>\s*Usuń\s*</);
  });

  it("keeps window.confirm delete semantics", () => {
    expect(LIST).toContain("window.confirm");
    expect(LIST).toContain("onDeleteOne");
  });
});
