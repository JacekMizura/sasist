import { describe, expect, it } from "vitest";

import { buildNavFlyoutCategories, isCategoryActive } from "./mainNavConfig";

describe("Phase B IA — Administracja flyout (SASIST pattern)", () => {
  it("exposes Administracja as side flyout with damages links", () => {
    const warehouse = buildNavFlyoutCategories().find((c) => c.id === "warehouse");
    expect(warehouse).toBeTruthy();
    expect(warehouse!.opensSideFlyout).toBe(true);
    expect(warehouse!.directPath).toBeUndefined();
    const byLabel = Object.fromEntries(
      warehouse!.flyoutSections.flatMap((s) => s.items.map((i) => [i.label, i.path])),
    );
    expect(byLabel["Szkody"]).toBe("/office/damages");
    expect(byLabel["Protokoły szkód"]).toBe("/office/damage-reports");
    expect(isCategoryActive(warehouse!, "/office/damages")).toBe(true);
    expect(isCategoryActive(warehouse!, "/office/damage-reports")).toBe(true);
  });

  it("exposes Zarządzanie as side flyout (Pulpit, Kolejność, Raporty, Plan)", () => {
    const analizy = buildNavFlyoutCategories().find((c) => c.id === "analizy");
    expect(analizy).toBeTruthy();
    expect(analizy!.opensSideFlyout).toBe(true);
    expect(analizy!.directPath).toBeUndefined();
    const labels = analizy!.flyoutSections.flatMap((s) => s.items.map((i) => i.label));
    expect(labels).toEqual([
      "Pulpit kierownika",
      "Kolejność dostaw",
      "Raporty",
      "Plan zmian",
    ]);
  });

  it("does not expose barcode, waves, planning, inventory list, or KSeF in main nav", () => {
    const paths = buildNavFlyoutCategories().flatMap((c) =>
      c.flyoutSections.flatMap((s) => s.items.map((i) => i.path)),
    );
    expect(paths).not.toContain("/barcode-management");
    expect(paths).not.toContain("/waves");
    expect(paths).not.toContain("/planning/deliveries");
    expect(paths).not.toContain("/planning/list");
    expect(paths).not.toContain("/inventory");
    expect(paths).not.toContain("/documents/ksef");
    expect(paths).not.toContain("/documents/custom-fields");
    expect(paths).not.toContain("/report/warehouse-structure");
  });

  it("keeps LabelSystem under Szablony → /templates/labels (and Administracja flyout)", () => {
    const labelEntries = buildNavFlyoutCategories().flatMap((c) =>
      c.flyoutSections.flatMap((s) =>
        s.items
          .filter((i) => i.path === "/templates/labels")
          .map((i) => ({ id: c.id, path: i.path })),
      ),
    );
    expect(labelEntries).toEqual(
      expect.arrayContaining([
        { id: "templates", path: "/templates/labels" },
        { id: "warehouse", path: "/templates/labels" },
      ]),
    );
  });
});
