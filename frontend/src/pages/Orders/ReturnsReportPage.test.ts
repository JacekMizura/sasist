/**
 * Returns report — grouped RMZ rows + expand semantics.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(path.join(HERE, "ReturnsReportPage.tsx"), "utf8");
const API = readFileSync(path.join(HERE, "../../api/returnsReportApi.ts"), "utf8");
const TABS = readFileSync(path.join(HERE, "ReturnsModuleTabsStrip.tsx"), "utf8");

describe("Returns report grouped UX", () => {
  it("keeps Raport zwrotów tab", () => {
    expect(TABS).toContain('label: "Raport zwrotów"');
  });

  it("uses grouped API shape and expand/collapse", () => {
    expect(API).toContain("ReturnsReportGroup");
    expect(API).toContain("aggregates");
    expect(PAGE).toContain("toggleExpand");
    expect(PAGE).toContain("expanded");
    expect(PAGE).toContain("ChevronRight");
    expect(PAGE).toContain("ChevronDown");
    expect(PAGE).toContain("stopPropagation");
    expect(PAGE).toContain("return-lines-");
  });

  it("pagination labels returns not lines", () => {
    expect(PAGE).toContain("zwrotów");
    expect(PAGE).not.toContain("Generuj raport");
  });

  it("resets expanded on filter change", () => {
    expect(PAGE).toContain("setExpanded(new Set())");
  });
});
