/**
 * Cutover SSOT checks — editor/store must not write rules to localStorage.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE = readFileSync(path.join(HERE, "../hooks/useOrderAutomationStore.ts"), "utf8");
const RUN = readFileSync(path.join(HERE, "orderAutomationRun.ts"), "utf8");
const EDITOR = readFileSync(path.join(HERE, "../pages/Orders/OrderAutomationEditorPage.tsx"), "utf8");

describe("order automations cutover SSOT", () => {
  it("store upserts via createAutomation/updateAutomation", () => {
    expect(STORE).toContain("createAutomation");
    expect(STORE).toContain("updateAutomation");
    expect(STORE).toContain("listAutomations");
    expect(STORE).not.toMatch(/saveAutomationRules\(/);
  });

  it("runtime uses backend runAutomation, not FE effect loop", () => {
    expect(RUN).toContain("runAutomation");
    expect(RUN).toContain("retired");
    expect(RUN).not.toContain("patchOrderUiStatus");
  });

  it("editor save goes through upsertRule (backend)", () => {
    expect(EDITOR).toContain("upsertRule");
    expect(EDITOR).toContain("dry-run");
  });
});
