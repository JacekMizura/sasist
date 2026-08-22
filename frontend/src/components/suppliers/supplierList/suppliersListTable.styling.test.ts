import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLE = readFileSync(path.join(HERE, "SuppliersListTable.tsx"), "utf8");
const TOKENS = readFileSync(path.join(HERE, "suppliersListTableTokens.ts"), "utf8");

describe("Suppliers list table styling", () => {
  it("uses shared operational action buttons", () => {
    expect(TABLE).toContain("OperationalActionButton");
    expect(TABLE).not.toContain("suppliersListRowActionBtn");
    expect(TABLE).toContain('title="Edytuj dostawcę"');
    expect(TABLE).toContain('variant="accent"');
  });

  it("primary name uses text-sm font-medium", () => {
    expect(TABLE).toContain("text-sm font-medium text-slate-900");
    expect(TABLE).not.toContain("text-base font-semibold");
  });

  it("badges use design-system StatusBadge", () => {
    expect(TABLE).toContain("StatusBadge");
    expect(TABLE).not.toContain("suppliersListBadgeBaseClass");
    expect(TABLE).toContain("Darmowa możliwa");
    expect(TABLE).toContain("MOQ wymagane");
  });

  it("action column fits three 40px buttons", () => {
    expect(TOKENS).toContain("actionsPx: 128");
  });
});
