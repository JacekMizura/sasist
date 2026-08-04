import { describe, expect, it } from "vitest";

import { buildNavFlyoutCategories, isCategoryActive } from "./mainNavConfig";

describe("Phase B IA — Magazyn / Pulpit flyouts (SASIST pattern)", () => {
  it("exposes Magazyn as side flyout with damages links (no label templates)", () => {
    const warehouse = buildNavFlyoutCategories().find((c) => c.id === "warehouse");
    expect(warehouse).toBeTruthy();
    expect(warehouse!.label).toBe("Magazyn");
    expect(warehouse!.opensSideFlyout).toBe(true);
    expect(warehouse!.directPath).toBeUndefined();
    const byLabel = Object.fromEntries(
      warehouse!.flyoutSections.flatMap((s) => s.items.map((i) => [i.label, i.path])),
    );
    expect(byLabel["Szkody"]).toBe("/office/damages");
    expect(byLabel["Protokoły szkód"]).toBe("/office/damage-reports");
    expect(byLabel["Szablony etykiet"]).toBeUndefined();
    expect(isCategoryActive(warehouse!, "/office/damages")).toBe(true);
    expect(isCategoryActive(warehouse!, "/office/damage-reports")).toBe(true);
  });

  it("exposes Pulpit as side flyout (kierownika, Kolejność, Raporty, Plan)", () => {
    const analizy = buildNavFlyoutCategories().find((c) => c.id === "analizy");
    expect(analizy).toBeTruthy();
    expect(analizy!.label).toBe("Pulpit");
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

  it("keeps LabelSystem only under Szablony → /templates/labels", () => {
    const labelEntries = buildNavFlyoutCategories().flatMap((c) =>
      c.flyoutSections.flatMap((s) =>
        s.items
          .filter((i) => i.path === "/templates/labels")
          .map((i) => ({ id: c.id, path: i.path })),
      ),
    );
    expect(labelEntries).toEqual([{ id: "templates", path: "/templates/labels" }]);
  });
});
