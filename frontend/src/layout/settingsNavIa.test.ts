import { describe, expect, it } from "vitest";

import { buildNavFlyoutCategories } from "./mainNavConfig";
import { isNavPathActive } from "./navActive";

describe("settings flyout IA", () => {
  it("lists Integracje, Klucze API and Eksport as separate first-level items", () => {
    const settings = buildNavFlyoutCategories().find((c) => c.id === "settings");
    expect(settings).toBeTruthy();
    const labels = settings!.flyoutSections.flatMap((s) => s.items.map((i) => i.label));
    expect(labels[0]).toBe("Ogólne");
    expect(labels[1]).toBe("Użytkownicy");
    expect(labels[2]).toBe("Integracje");
    expect(labels[3]).toBe("Klucze API");
    expect(labels[4]).toBe("Eksport");
    expect(labels).toContain("Metody dostawy");
    expect(labels).toContain("System");

    const byLabel = Object.fromEntries(
      settings!.flyoutSections.flatMap((s) => s.items.map((i) => [i.label, i.path])),
    );
    expect(byLabel["Integracje"]).toBe("/settings/integrations");
    expect(byLabel["Klucze API"]).toBe("/settings/api-keys");
    expect(byLabel["Eksport"]).toBe("/settings/exports");
    expect(byLabel["Integracje"]).not.toBe(byLabel["Klucze API"]);
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
});
