/**
 * Returns report tab wiring.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABS = readFileSync(path.join(HERE, "ReturnsModuleTabsStrip.tsx"), "utf8");
const PAGE = readFileSync(path.join(HERE, "ReturnsReportPage.tsx"), "utf8");
const API = readFileSync(path.join(HERE, "../../api/returnsReportApi.ts"), "utf8");
const APP = readFileSync(path.join(HERE, "../../App.tsx"), "utf8");

describe("Returns report module", () => {
  it("adds Raport zwrotów tab", () => {
    expect(TABS).toContain('label: "Raport zwrotów"');
    expect(TABS).toContain("${BASE}/report");
  });

  it("registers route and live filters (no Generuj raport)", () => {
    expect(APP).toContain("ReturnsReportPage");
    expect(APP).toContain('path="report"');
    expect(PAGE).not.toContain("Generuj raport");
    expect(PAGE).toContain("fetchReturnsReport");
    expect(PAGE).toContain("Eksportuj");
  });

  it("API client hits returns/report", () => {
    expect(API).toContain("returns/report");
    expect(API).toContain("returns/report/export");
  });
});
