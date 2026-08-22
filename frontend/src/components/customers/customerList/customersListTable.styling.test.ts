import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLE = readFileSync(path.join(HERE, "CustomersListTable.tsx"), "utf8");
const TOKENS = readFileSync(path.join(HERE, "customersListTableTokens.ts"), "utf8");
const PRODUCTS = readFileSync(
  path.join(HERE, "../../products/productList/productsListTableTokens.ts"),
  "utf8",
);

describe("Customers list table styling", () => {
  it("uses shared operational action buttons (Orders/Products pattern)", () => {
    expect(TABLE).toContain("OperationalActionButton");
    expect(TABLE).toContain("OperationalActionLink");
    expect(TABLE).not.toContain("customersListRowActionBtn");
    expect(TABLE).toContain('title="Edytuj klienta"');
    expect(TABLE).toContain('title="Usuń klienta"');
  });

  it("primary name uses text-sm font-medium — not text-base", () => {
    expect(TABLE).toContain("text-sm font-medium text-slate-900");
    expect(TABLE).not.toContain("text-base font-semibold");
  });

  it("badges use text-xs font-medium shared token", () => {
    expect(TABLE).toContain("customersListBadgeBaseClass");
    expect(TABLE).not.toContain("text-[11px]");
    expect(TOKENS).toContain("text-xs font-medium");
  });

  it("action column width matches Products (88px)", () => {
    expect(TOKENS).toContain('"88px"');
    expect(PRODUCTS).toContain("[88px]");
  });
});
