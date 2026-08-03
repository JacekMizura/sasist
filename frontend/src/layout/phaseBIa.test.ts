import { describe, expect, it } from "vitest";

import { ADMINISTRACJA_LINKS } from "../modules/administracja/administracjaNav";
import { buildNavFlyoutCategories, isCategoryActive } from "./mainNavConfig";

describe("Phase B IA — Administracja L1 + no stub menu entries", () => {
  it("exposes Administracja as L1 hub (not flyout) with damages reachable from hub", () => {
    const warehouse = buildNavFlyoutCategories().find((c) => c.id === "warehouse");
    expect(warehouse).toBeTruthy();
    expect(warehouse!.directPath).toBe("/administracja-magazynem");
    expect(warehouse!.opensSideFlyout).toBeFalsy();
    expect(warehouse!.flyoutSections).toEqual([]);

    expect(ADMINISTRACJA_LINKS.some((l) => l.to === "/office/damages")).toBe(true);
    expect(ADMINISTRACJA_LINKS.some((l) => l.to === "/office/damage-reports")).toBe(true);
    expect(isCategoryActive(warehouse!, "/office/damages")).toBe(true);
    expect(isCategoryActive(warehouse!, "/office/damage-reports")).toBe(true);
    expect(isCategoryActive(warehouse!, "/administracja-magazynem")).toBe(true);
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
