import { describe, expect, it } from "vitest";

import { buildNavFlyoutCategories, isCategoryActive } from "./mainNavConfig";

describe("Phase B IA — Magazyn damages + no stub menu entries", () => {
  it("exposes Szkody under Magazyn flyout only", () => {
    const warehouse = buildNavFlyoutCategories().find((c) => c.id === "warehouse");
    expect(warehouse).toBeTruthy();
    const byLabel = Object.fromEntries(
      warehouse!.flyoutSections.flatMap((s) => s.items.map((i) => [i.label, i.path])),
    );
    expect(byLabel["Szkody"]).toBe("/office/damages");
    expect(byLabel["Protokoły szkód"]).toBe("/office/damage-reports");
    expect(isCategoryActive(warehouse!, "/office/damages")).toBe(true);
    expect(isCategoryActive(warehouse!, "/office/damage-reports")).toBe(true);
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

  it("keeps a single LabelSystem menu entry under Szablony → /templates/labels", () => {
    const labelEntries = buildNavFlyoutCategories().flatMap((c) =>
      c.flyoutSections.flatMap((s) =>
        s.items
          .filter(
            (i) =>
              i.path === "/labels" ||
              i.path === "/admin/print-templates" ||
              i.path === "/templates/labels",
          )
          .map((i) => ({ id: c.id, path: i.path })),
      ),
    );
    expect(labelEntries).toEqual([{ id: "templates", path: "/templates/labels" }]);
  });
});
