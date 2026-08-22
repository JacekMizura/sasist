import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "DocumentSeriesListPage.tsx"), "utf8");

describe("DocumentSeriesListPage actions", () => {
  it("uses icon buttons with tooltips — no Edytuj/Usuń text in actions column", () => {
    expect(SRC).toContain("OperationalActionButton");
    expect(SRC).toContain("OperationalActionLink");
    expect(SRC).toContain('title="Edytuj serię"');
    expect(SRC).toContain('title="Usuń serię"');
    expect(SRC).toContain("<Pencil");
    expect(SRC).toContain("<Trash2");
    expect(SRC).not.toMatch(/>\s*Edytuj\s*</);
    expect(SRC).not.toMatch(/>\s*Usuń\s*</);
  });

  it("keeps window.confirm delete semantics", () => {
    expect(SRC).toContain("window.confirm");
    expect(SRC).toContain("onDeleteOne");
  });
});
