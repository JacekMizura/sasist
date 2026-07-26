import { describe, expect, it } from "vitest";

import { buildNavFlyoutCategories, isCategoryActive } from "./mainNavConfig";
import { isNavPathActive } from "./navActive";

describe("settings flyout IA", () => {
  it("lists settings items without duplicate LabelSystem entry", () => {
    const settings = buildNavFlyoutCategories().find((c) => c.id === "settings");
    expect(settings).toBeTruthy();
    const labels = settings!.flyoutSections.flatMap((s) => s.items.map((i) => i.label));

    expect(labels[0]).toBe("Ogólne");
    expect(labels[1]).toBe("Użytkownicy");
    expect(labels[2]).toBe("Integracje");
    expect(labels[3]).toBe("Klucze API");
    expect(labels[4]).toBe("Import");
    expect(labels[5]).toBe("Eksport");
    expect(labels[6]).toBe("Metody dostawy");
    expect(labels[7]).toBe("Pule stanów");
    expect(labels[8]).toBe("Drukarki");
    expect(labels[9]).toBe("Szablony dokumentów");
    expect(labels[10]).toBe("Szablony wiadomości");
    expect(labels[11]).toBe("System");
    expect(labels).toContain("Słownik aplikacji");
    expect(labels).not.toContain("Szablony etykiet");
    expect(labels).not.toContain("Szablony wydruków");

    const byLabel = Object.fromEntries(
      settings!.flyoutSections.flatMap((s) => s.items.map((i) => [i.label, i.path])),
    );
    expect(byLabel["Import"]).toBe("/settings/import");
    expect(byLabel["Eksport"]).toBe("/settings/exports");
    expect(byLabel["Drukarki"]).toBe("/settings/printers");
    expect(byLabel["Szablony dokumentów"]).toBe("/settings/document-templates");
    expect(byLabel["Szablony wiadomości"]).toBe("/admin/message-templates");
    expect(byLabel["Szablony etykiet"]).toBeUndefined();
  });

  it("exposes System Etykiet only under Operacje → /labels", () => {
    const cats = buildNavFlyoutCategories();
    const labelEntries = cats.flatMap((c) =>
      c.flyoutSections.flatMap((s) =>
        s.items
          .filter(
            (i) =>
              i.path === "/labels" ||
              i.path === "/admin/print-templates" ||
              i.path.startsWith("/system-etykiet"),
          )
          .map((i) => ({ categoryId: c.id, path: i.path, label: i.label })),
      ),
    );
    expect(labelEntries).toEqual([{ categoryId: "labels", path: "/labels", label: "System Etykiet" }]);
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

  it("highlights Eksport for list and editor routes", () => {
    expect(isNavPathActive("/settings/exports", "/settings/exports")).toBe(true);
    expect(isNavPathActive("/settings/exports/new", "/settings/exports")).toBe(true);
    expect(isNavPathActive("/settings/exports/12", "/settings/exports")).toBe(true);
    expect(isNavPathActive("/settings/api-keys", "/settings/exports")).toBe(false);
  });

  it("treats label aliases as active for canonical /labels menu path", () => {
    expect(isNavPathActive("/labels", "/labels")).toBe(true);
    expect(isNavPathActive("/labels/designer/1", "/labels")).toBe(true);
    expect(isNavPathActive("/admin/print-templates", "/labels")).toBe(true);
    expect(isNavPathActive("/admin/print-templates/ready", "/labels")).toBe(true);
    expect(isNavPathActive("/system-etykiet/queue", "/labels")).toBe(true);
  });
});

describe("settings category vs labels category", () => {
  it("does not treat print-templates as settings flyout membership after IA cleanup", () => {
    const settings = buildNavFlyoutCategories().find((c) => c.id === "settings")!;
    expect(isCategoryActive(settings, "/admin/print-templates")).toBe(false);
    expect(isCategoryActive(settings, "/labels")).toBe(false);
    const labelsCat = buildNavFlyoutCategories().find((c) => c.id === "labels")!;
    expect(isCategoryActive(labelsCat, "/labels")).toBe(true);
    expect(isCategoryActive(labelsCat, "/admin/print-templates")).toBe(true);
  });
});
