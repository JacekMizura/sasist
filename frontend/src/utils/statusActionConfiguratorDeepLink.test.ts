/**
 * Contract: STATUS_ACTION deep links land on status configurators with editStatusId.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(HERE, ".."); // frontend/src

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("status configurator deep-link contract", () => {
  it("ORDER page reads editStatusId", () => {
    const src = read("pages/Settings/OrderPanelUiStatusesSettingsPage.tsx");
    expect(src).toContain("STATUS_ACTION_EDIT_QUERY");
    expect(src).toContain("useSearchParams");
  });

  it("RETURN configurator reads editStatusId", () => {
    const src = read("pages/Settings/returnsStatusesConfigurator/ReturnsStatusesConfigurator.tsx");
    expect(src).toContain("STATUS_ACTION_EDIT_QUERY");
    expect(src).toContain("setStatusModal");
  });

  it("COMPLAINT page reads editStatusId", () => {
    const src = read("pages/Settings/ComplaintPanelUiStatusesSettingsPage.tsx");
    expect(src).toContain("STATUS_ACTION_EDIT_QUERY");
    expect(src).toContain("useSearchParams");
  });

  it("AutomationRulesTable routes by entityType", () => {
    const src = read("components/orders/automation/AutomationRulesTable.tsx");
    expect(src).toContain("resolveStatusActionDeepLink");
    expect(src).not.toMatch(/navigate\(`\/orders\/statuses\?editStatusId=\$\{rule\.triggerStatusId\}`\)/);
  });
});
