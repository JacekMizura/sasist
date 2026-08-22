import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "PurchasingPoPage.tsx"), "utf8");

describe("PurchasingPoPage actions", () => {
  it("uses icon link instead of Otwórz text in actions column", () => {
    expect(SRC).toContain("OperationalActionLink");
    expect(SRC).toContain('title="Otwórz zamówienie"');
    expect(SRC).toContain("<Eye");
    expect(SRC).not.toMatch(/>\s*Otwórz\s*</);
  });
});
