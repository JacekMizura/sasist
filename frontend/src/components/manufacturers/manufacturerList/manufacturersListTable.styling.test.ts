import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLE = readFileSync(path.join(HERE, "ManufacturersListTable.tsx"), "utf8");
const TOKENS = readFileSync(path.join(HERE, "manufacturersListTableTokens.ts"), "utf8");

describe("Manufacturers list table styling", () => {
  it("uses shared operational action buttons", () => {
    expect(TABLE).toContain("OperationalActionButton");
    expect(TABLE).not.toContain("manufacturersListRowActionBtn");
    expect(TABLE).toContain('title="Edytuj producenta"');
  });

  it("primary name uses text-sm font-medium", () => {
    expect(TABLE).toContain("text-sm font-medium text-slate-900");
    expect(TABLE).not.toContain("text-base font-semibold");
  });

  it("action column width matches Customers (88px)", () => {
    expect(TOKENS).toContain('"88px"');
    expect(TOKENS).toContain("actionsPx: 88");
  });
});
