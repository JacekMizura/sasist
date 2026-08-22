import { describe, expect, it } from "vitest";

import { buildNavFlyoutCategories, isCategoryActive } from "./mainNavConfig";

describe("Zarządzanie / Magazyn IA — flyouts SASIST", () => {
  it("exposes Zarządzanie flyout for manager workstation", () => {
    const analizy = buildNavFlyoutCategories().find((c) => c.id === "analizy");
    expect(analizy).toBeTruthy();
    expect(analizy!.label).toBe("Zarządzanie");
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

  it("exposes Magazyn config flyout without label templates", () => {
    const warehouse = buildNavFlyoutCategories().find((c) => c.id === "warehouse");
    expect(warehouse).toBeTruthy();
    expect(warehouse!.label).toBe("Magazyn");
    expect(warehouse!.opensSideFlyout).toBe(true);
    const labels = warehouse!.flyoutSections.flatMap((s) => s.items.map((i) => i.label));
    expect(labels).toEqual([
      "Layout magazynu",
      "Wózki",
      "Strefa sortująca",
      "Nośniki",
      "Inwentaryzacja",
      "Planer floty",
      "BDO",
      "Szkody",
      "Protokoły szkód",
    ]);
    expect(labels).not.toContain("Szablony etykiet");
    expect(labels).not.toContain("Ustawienia WMS");
    expect(labels).not.toContain("Konfiguracja WMS");
    expect(isCategoryActive(warehouse!, "/designer")).toBe(true);
    expect(isCategoryActive(warehouse!, "/inventory-count/dashboard")).toBe(true);
    expect(isCategoryActive(warehouse!, "/settings/wms")).toBe(false);
  });

  it("exposes Ustawienia WMS at the bottom of settings flyout", () => {
    const settings = buildNavFlyoutCategories().find((c) => c.id === "settings");
    expect(settings).toBeTruthy();
    const labels = settings!.flyoutSections.flatMap((s) => s.items.map((i) => i.label));
    expect(labels[labels.length - 1]).toBe("Ustawienia WMS");
    expect(isCategoryActive(settings!, "/settings/wms")).toBe(true);
    expect(isCategoryActive(settings!, "/settings/wms/workstations")).toBe(true);
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
