/**
 * StatusActionsPanel — compact Sellasist projection; STATUS_ACTION SSOT.
 * List UX lives in StatusActionsMatrix (inline checkboxes).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "StatusActionsPanel.tsx"), "utf8");
const MATRIX = readFileSync(path.join(HERE, "statusActionsMatrix/StatusActionsMatrix.tsx"), "utf8");
const CELL = readFileSync(path.join(HERE, "statusActionsMatrix/StatusActionCell.tsx"), "utf8");
const CATALOG = readFileSync(path.join(HERE, "../../utils/statusActionManagedCatalog.ts"), "utf8");
const API = readFileSync(path.join(HERE, "../../api/automationsApi.ts"), "utf8");
const LIST = readFileSync(
  path.join(HERE, "../../pages/Settings/returnsStatusesConfigurator/ListLabelsSection.tsx"),
  "utf8",
);
const EFFECT_CATALOG = readFileSync(path.join(HERE, "../../utils/orderAutomationCatalog.ts"), "utf8");

describe("Status actions matrix UX", () => {
  it("L — no under-name action text / Brak automatycznych akcji on list", () => {
    expect(LIST).not.toContain("Brak automatycznych akcji");
    expect(LIST).not.toContain("StatusActionListHints");
    expect(LIST).toContain("StatusActionsMatrix");
  });

  it("matrix has action columns + inline upsert", () => {
    expect(MATRIX).toContain("STATUS_ACTION_COLUMN_HEADERS");
    expect(MATRIX).toContain("upsertStatusActions");
    expect(MATRIX).toContain("onOverviewChanged");
    expect(CATALOG).toContain('warehouse_commit: "Magazyn"');
  });

  it("F/G — email uses popover; warehouse is direct toggle", () => {
    expect(CELL).toContain("StatusEmailActionPopover");
    expect(CELL).toContain("onToggleWarehouse");
    expect(CELL).toContain("onSaveEmail");
  });

  it("batch overview API", () => {
    expect(API).toContain("status-actions/overview");
    expect(API).toContain("listStatusActionsOverview");
  });

  it("modal panel remains compact secondary editor", () => {
    expect(SRC).toContain("Automatyczne akcje po wejściu w status");
    expect(SRC).not.toContain("Zmień status");
    expect(SRC).not.toContain("ChevronUp");
  });

  it("H — ORDER/COMPLAINT keys emails only", () => {
    expect(CATALOG).toContain('return ["warehouse_commit", "send_email_customer", "send_email_internal"]');
    expect(CATALOG).toContain('return ["send_email_customer", "send_email_internal"]');
  });

  it("main Automation Editor still supports change_status", () => {
    expect(EFFECT_CATALOG).toContain('kind: "change_status"');
  });
});
