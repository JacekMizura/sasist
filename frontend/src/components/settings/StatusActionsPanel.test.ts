/**
 * StatusActionsPanel — compact Sellasist projection; STATUS_ACTION SSOT.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "StatusActionsPanel.tsx"), "utf8");
const HINTS = readFileSync(path.join(HERE, "StatusActionListHints.tsx"), "utf8");
const CATALOG = readFileSync(path.join(HERE, "../../utils/statusActionManagedCatalog.ts"), "utf8");
const API = readFileSync(path.join(HERE, "../../api/automationsApi.ts"), "utf8");
const EFFECT_CATALOG = readFileSync(path.join(HERE, "../../utils/orderAutomationCatalog.ts"), "utf8");
const LIST = readFileSync(
  path.join(HERE, "../../pages/Settings/returnsStatusesConfigurator/ListLabelsSection.tsx"),
  "utf8",
);

describe("StatusActionsPanel compact UX", () => {
  it("uses list + upsert status-actions (one-rule model)", () => {
    expect(SRC).toContain("listStatusActions");
    expect(SRC).toContain("upsertStatusActions");
    expect(SRC).toContain("Automatyczne akcje po wejściu w status");
    expect(SRC).toContain("Zaznaczone akcje zostaną wykonane automatycznie");
    expect(SRC).not.toContain("createAutomation");
  });

  it("A/B/C — no change_status checkbox; compact property list", () => {
    expect(SRC).not.toContain("Zmień status");
    expect(SRC).not.toMatch(/effect_type:\s*["']change_status["']/);
    expect(SRC).not.toContain("ChevronUp");
    expect(SRC).not.toContain("ChevronDown");
    expect(SRC).toContain("zaawansowaną akcję zmiany statusu");
  });

  it("F — email config only when enabled; G — warehouse_commit is tooltip not block", () => {
    expect(SRC).toContain('d.enabled && d.key === "send_email_customer"');
    expect(SRC).toContain("WAREHOUSE_COMMIT_TOOLTIP");
    expect(SRC).not.toMatch(/Akcja wykona przyjęcie zwrotu przez istniejący workflow RMZ/);
  });

  it("H — ORDER/COMPLAINT keys are emails only; RETURN adds warehouse_commit", () => {
    expect(CATALOG).toContain('return ["warehouse_commit", "send_email_customer", "send_email_internal"]');
    expect(CATALOG).toContain('return ["send_email_customer", "send_email_internal"]');
  });

  it("does not advertise blocked effects", () => {
    expect(SRC).not.toMatch(/Zwrot płatności|SMS|Korekta dokumentu|Przywróć stan|Dodaj tag/i);
  });

  it("batch overview API for list (no N+1)", () => {
    expect(API).toContain("status-actions/overview");
    expect(API).toContain("listStatusActionsOverview");
  });

  it("list shows business action hints", () => {
    expect(LIST).toContain("StatusActionListHints");
    expect(LIST).toContain("actionsByStatusId");
    expect(HINTS).toContain("Brak automatycznych akcji");
    expect(HINTS).toContain("✓");
  });

  it("L — main Automation Editor still supports change_status", () => {
    expect(EFFECT_CATALOG).toContain('kind: "change_status"');
    expect(EFFECT_CATALOG).toMatch(/change_status[\s\S]*backendSupported:\s*true/);
  });
});
