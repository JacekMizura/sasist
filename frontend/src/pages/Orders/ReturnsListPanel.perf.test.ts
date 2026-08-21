/**
 * Returns list load: critical path vs auxiliary; no Bez etykiety nav.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PANEL = readFileSync(path.join(HERE, "ReturnsListPanel.tsx"), "utf8");
const SIDEBAR = readFileSync(path.join(HERE, "../../components/orders/OrdersPanelStatusSidebar.tsx"), "utf8");

describe("Returns list performance UX", () => {
  it("starts list+summary before auxiliary requests settle", () => {
    expect(PANEL).toContain("listPromise");
    expect(PANEL).toContain("summaryPromise");
    expect(PANEL).toContain("await Promise.all([listPromise, summaryPromise])");
    expect(PANEL).toContain("/* auxiliary failure must not clear the list */");
    const criticalIdx = PANEL.indexOf("await Promise.all([listPromise, summaryPromise])");
    const auxIdx = PANEL.indexOf("getReturnPanelSubgroups(DAMAGE_TENANT_ID, effectiveWh)");
    expect(criticalIdx).toBeGreaterThan(-1);
    expect(auxIdx).toBeGreaterThan(criticalIdx);
  });

  it("hides Bez etykiety from returns sidebar nav", () => {
    expect(PANEL).toContain("showUnassignedNav={false}");
    expect(SIDEBAR).toContain("showUnassignedNav");
    expect(PANEL).toContain('if (panelFilter === "unassigned")');
  });
});
