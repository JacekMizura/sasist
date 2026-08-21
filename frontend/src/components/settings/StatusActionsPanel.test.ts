/**
 * StatusActionsPanel — must use backend Automation API (STATUS_ACTION), never localStorage.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "StatusActionsPanel.tsx"), "utf8");
const API = readFileSync(path.join(HERE, "../../api/automationsApi.ts"), "utf8");

describe("StatusActionsPanel SSOT", () => {
  it("uses backend listStatusActions / createAutomation with STATUS_ACTION", () => {
    expect(SRC).toContain("listStatusActions");
    expect(SRC).toContain("createAutomation");
    expect(SRC).toContain('source: "STATUS_ACTION"');
    expect(SRC).toContain('effect_type: "change_status"');
    expect(SRC).toContain("Automatyczne akcje po wejściu w status");
  });

  it("does not write rules to localStorage", () => {
    expect(SRC).not.toMatch(/orderAutomationLocalStore/);
    expect(SRC).not.toMatch(/localStorage\.(setItem|getItem)/);
  });

  it("API exposes status-actions projection endpoint", () => {
    expect(API).toContain("automations/status-actions");
    expect(API).toContain("listStatusActions");
  });
});
