import { describe, expect, it } from "vitest";

import { buildNavFlyoutCategories, isCategoryActive } from "./mainNavConfig";
import { isNavPathActive } from "./navActive";

describe("settings flyout IA", () => {
  it("lists settings items without template modules (moved to Szablony category)", () => {
    const settings = buildNavFlyoutCategories().find((c) => c.id === "settings");
    expect(settings).toBeTruthy();
    const labels = settings!.flyoutSections.flatMap((s) => s.items.map((i) => i.label));

    expect(labels[0]).toBe("Ogólne");
    expect(labels[1]).toBe("Użytkownicy");
    expect(labels[2]).toBe("Integracje");
    expect(labels[3]).toBe("Klucze API");
    expect(labels[4]).toBe("Import");
    expect(labels[5]).toBe("Metody dostawy");
    expect(labels).not.toContain("Pule stanów");
    expect(labels).not.toContain("System");
    expect(labels).not.toContain("Słownik aplikacji");
    expect(labels).not.toContain("Urządzenia");
    expect(labels).not.toContain("Drukarki");
    expect(labels).not.toContain("Stanowiska");
    expect(labels).not.toContain("Eksport");
    expect(labels).not.toContain("Szablony dokumentów");
    expect(labels).not.toContain("Szablony wiadomości");
    expect(labels).not.toContain("Szablony etykiet");
    expect(labels).not.toContain("System Etykiet");
  });

  it("highlights WMS config under Magazyn (not Ogólne Ustawienia)", () => {
    const cats = buildNavFlyoutCategories();
    const settings = cats.find((c) => c.id === "settings")!;
    const warehouse = cats.find((c) => c.id === "warehouse")!;
    const wsPath = "/settings/wms/workstations";
    const wsDetail = "/settings/wms/workstations/12";

    expect(isCategoryActive(settings, wsPath)).toBe(false);
    expect(isCategoryActive(settings, wsDetail)).toBe(false);
    expect(isCategoryActive(warehouse, wsPath)).toBe(true);
    expect(isCategoryActive(warehouse, wsDetail)).toBe(true);

    expect(isNavPathActive("/settings/wms", "/settings/wms")).toBe(true);
    expect(isNavPathActive(wsPath, "/settings/wms")).toBe(true);
  });

  it("exposes Szablony as flyout category with four independent modules", () => {
    const cats = buildNavFlyoutCategories();
    const templatesCat = cats.find((c) => c.id === "templates");
    expect(templatesCat).toBeTruthy();
    expect(templatesCat!.opensSideFlyout).toBe(true);
    expect(templatesCat!.label).toBe("Szablony");

    const templateEntries = templatesCat!.flyoutSections.flatMap((s) =>
      s.items.map((i) => ({ path: i.path, label: i.label })),
    );
    expect(templateEntries).toEqual([
      { path: "/templates/labels", label: "Szablony etykiet" },
      { path: "/templates/print", label: "Szablony wydruków" },
      { path: "/templates/messages", label: "Szablony wiadomości" },
      { path: "/templates/exports", label: "Eksporty" },
    ]);

    // No single hub leaf at /templates
    const hubLeaf = cats.flatMap((c) =>
      c.flyoutSections.flatMap((s) => s.items.filter((i) => i.path === "/templates")),
    );
    expect(hubLeaf).toEqual([]);
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

  it("highlights each template module path independently", () => {
    expect(isNavPathActive("/templates/labels", "/templates/labels")).toBe(true);
    expect(isNavPathActive("/templates/labels/queue", "/templates/labels")).toBe(true);
    expect(isNavPathActive("/labels/designer/1", "/templates/labels")).toBe(true);
    expect(isNavPathActive("/templates/print", "/templates/labels")).toBe(false);

    expect(isNavPathActive("/templates/print/starters", "/templates/print")).toBe(true);
    expect(isNavPathActive("/settings/document-templates", "/templates/print")).toBe(true);
    expect(isNavPathActive("/templates/labels", "/templates/print")).toBe(false);

    expect(isNavPathActive("/templates/messages", "/templates/messages")).toBe(true);
    expect(isNavPathActive("/admin/message-templates", "/templates/messages")).toBe(true);

    expect(isNavPathActive("/templates/exports/new", "/templates/exports")).toBe(true);
    expect(isNavPathActive("/settings/exports", "/templates/exports")).toBe(true);
    expect(isNavPathActive("/settings/api-keys", "/templates/exports")).toBe(false);
  });
});

describe("settings category vs templates category", () => {
  it("does not treat templates routes as settings flyout membership", () => {
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
