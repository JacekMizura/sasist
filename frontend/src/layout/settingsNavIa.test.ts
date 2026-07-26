import { describe, expect, it } from "vitest";

import { buildNavFlyoutCategories } from "./mainNavConfig";
import { isNavPathActive } from "./navActive";

describe("settings flyout IA", () => {
  it("lists Phase A settings items in order with distinct paths", () => {
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
    expect(labels[9]).toBe("Szablony etykiet");
    expect(labels[10]).toBe("Szablony dokumentów");
    expect(labels[11]).toBe("Szablony wiadomości");
    expect(labels[12]).toBe("System");
    expect(labels).toContain("Słownik aplikacji");

    const byLabel = Object.fromEntries(
      settings!.flyoutSections.flatMap((s) => s.items.map((i) => [i.label, i.path])),
    );
    expect(byLabel["Integracje"]).toBe("/settings/integrations");
    expect(byLabel["Klucze API"]).toBe("/settings/api-keys");
    expect(byLabel["Import"]).toBe("/settings/import");
    expect(byLabel["Eksport"]).toBe("/settings/exports");
    expect(byLabel["Metody dostawy"]).toBe("/settings/shipping-methods");
    expect(byLabel["Pule stanów"]).toBe("/settings/sales/stock-pools");
    expect(byLabel["Drukarki"]).toBe("/settings/printers");
    expect(byLabel["Szablony etykiet"]).toBe("/admin/print-templates");
    expect(byLabel["Szablony dokumentów"]).toBe("/settings/document-templates");
    expect(byLabel["Szablony wiadomości"]).toBe("/admin/message-templates");
    expect(byLabel["Integracje"]).not.toBe(byLabel["Klucze API"]);
    expect(byLabel["Szablony etykiet"]).not.toBe(byLabel["Szablony dokumentów"]);
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

  it("highlights Phase A restored settings paths", () => {
    expect(isNavPathActive("/settings/import", "/settings/import")).toBe(true);
    expect(isNavPathActive("/settings/printers/agents", "/settings/printers")).toBe(true);
    expect(isNavPathActive("/settings/document-templates/12", "/settings/document-templates")).toBe(true);
    expect(isNavPathActive("/admin/message-templates/new", "/admin/message-templates")).toBe(true);
    expect(isNavPathActive("/admin/print-templates/designer", "/admin/print-templates")).toBe(true);
    expect(isNavPathActive("/settings/sales/stock-pools", "/settings/sales/stock-pools")).toBe(true);
  });
});
