import { describe, expect, it } from "vitest";

import { buildNavFlyoutCategories, isCategoryActive } from "./mainNavConfig";
import { isNavPathActive } from "./navActive";

describe("settings flyout IA", () => {
  it("lists settings items without template modules (moved to Szablony hub)", () => {
    const settings = buildNavFlyoutCategories().find((c) => c.id === "settings");
    expect(settings).toBeTruthy();
    const labels = settings!.flyoutSections.flatMap((s) => s.items.map((i) => i.label));

    expect(labels[0]).toBe("Ogólne");
    expect(labels[1]).toBe("Użytkownicy");
    expect(labels[2]).toBe("Integracje");
    expect(labels[3]).toBe("Klucze API");
    expect(labels[4]).toBe("Import");
    expect(labels[5]).toBe("Metody dostawy");
    expect(labels[6]).toBe("Pule stanów");
    expect(labels[7]).toBe("Drukarki");
    expect(labels[8]).toBe("System");
    expect(labels).toContain("Słownik aplikacji");
    expect(labels).not.toContain("Eksport");
    expect(labels).not.toContain("Szablony dokumentów");
    expect(labels).not.toContain("Szablony wiadomości");
    expect(labels).not.toContain("Szablony etykiet");
    expect(labels).not.toContain("System Etykiet");
  });

  it("exposes Szablony hub under Operacje → /templates", () => {
    const cats = buildNavFlyoutCategories();
    const templateEntries = cats.flatMap((c) =>
      c.flyoutSections.flatMap((s) =>
        s.items
          .filter((i) => i.path === "/templates" || i.path.startsWith("/templates/"))
          .map((i) => ({ categoryId: c.id, path: i.path, label: i.label })),
      ),
    );
    expect(templateEntries).toEqual([{ categoryId: "templates", path: "/templates", label: "Szablony" }]);
  });
});

describe("settings nav active states", () => {
  it("highlights Klucze API independently from Integracje", () => {
    expect(isNavPathActive("/settings/api-keys", "/settings/api-keys")).toBe(true);
    expect(isNavPathActive("/settings/integrations/api-keys", "/settings/api-keys")).toBe(true);
    expect(isNavPathActive("/settings/integrations", "/settings/api-keys")).toBe(false);
    expect(isNavPathActive("/settings/integrations", "/settings/integrations")).toBe(true);
    expect(isNavPathActive("/settings/integrations/api-keys", "/settings/integrations")).toBe(false);
    expect(isNavPathActive("/settings/api-keys", "/settings/integrations")).toBe(false);
  });

  it("highlights Szablony hub for all template section routes and legacy aliases", () => {
    expect(isNavPathActive("/templates", "/templates")).toBe(true);
    expect(isNavPathActive("/templates/labels", "/templates")).toBe(true);
    expect(isNavPathActive("/templates/print/starters", "/templates")).toBe(true);
    expect(isNavPathActive("/templates/messages", "/templates")).toBe(true);
    expect(isNavPathActive("/templates/exports/new", "/templates")).toBe(true);
    expect(isNavPathActive("/labels/designer/1", "/templates")).toBe(true);
    expect(isNavPathActive("/settings/exports", "/templates")).toBe(true);
    expect(isNavPathActive("/settings/api-keys", "/templates")).toBe(false);
  });
});

describe("settings category vs templates category", () => {
  it("does not treat templates hub as settings flyout membership", () => {
    const settings = buildNavFlyoutCategories().find((c) => c.id === "settings")!;
    expect(isCategoryActive(settings, "/templates")).toBe(false);
    expect(isCategoryActive(settings, "/templates/labels")).toBe(false);
    expect(isCategoryActive(settings, "/labels")).toBe(false);
    const templatesCat = buildNavFlyoutCategories().find((c) => c.id === "templates")!;
    expect(isCategoryActive(templatesCat, "/templates")).toBe(true);
    expect(isCategoryActive(templatesCat, "/templates/print")).toBe(true);
    expect(isCategoryActive(templatesCat, "/admin/print-templates")).toBe(true);
  });
});
