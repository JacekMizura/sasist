import { describe, expect, it } from "vitest";

import { buildNavFlyoutCategories, isCategoryActive } from "./mainNavConfig";

describe("Magazyn IA — flyouts SASIST", () => {
  it("exposes Magazyn flyout for manager workstation", () => {
    const analizy = buildNavFlyoutCategories().find((c) => c.id === "analizy");
    expect(analizy).toBeTruthy();
    expect(analizy!.label).toBe("Magazyn");
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

  it("exposes Administracja magazynem with Wózki and Inwentaryzacja, without label templates", () => {
    const warehouse = buildNavFlyoutCategories().find((c) => c.id === "warehouse");
    expect(warehouse).toBeTruthy();
    expect(warehouse!.label).toBe("Administracja magazynem");
    expect(warehouse!.opensSideFlyout).toBe(true);
    const byLabel = Object.fromEntries(
      warehouse!.flyoutSections.flatMap((s) => s.items.map((i) => [i.label, i.path])),
    );
    expect(byLabel["Wózki"]).toBe("/carts/bulk");
    expect(byLabel["Inwentaryzacja (planowanie ERP)"]).toBe("/inventory-count/dashboard");
    expect(byLabel["Szkody"]).toBe("/office/damages");
    expect(byLabel["Szablony etykiet"]).toBeUndefined();
    expect(isCategoryActive(warehouse!, "/carts/bulk")).toBe(true);
    expect(isCategoryActive(warehouse!, "/inventory-count/dashboard")).toBe(true);
  });

  it("keeps LabelSystem only under Szablony", () => {
    const labelEntries = buildNavFlyoutCategories().flatMap((c) =>
      c.flyoutSections.flatMap((s) =>
        s.items
          .filter((i) => i.path === "/templates/labels")
          .map((i) => ({ id: c.id, path: i.path })),
      ),
    );
    expect(labelEntries).toEqual([{ id: "templates", path: "/templates/labels" }]);
  });

  it("does not expose stub paths in main nav", () => {
    const paths = buildNavFlyoutCategories().flatMap((c) =>
      c.flyoutSections.flatMap((s) => s.items.map((i) => i.path)),
    );
    expect(paths).not.toContain("/barcode-management");
    expect(paths).not.toContain("/waves");
    expect(paths).not.toContain("/inventory");
  });
});
