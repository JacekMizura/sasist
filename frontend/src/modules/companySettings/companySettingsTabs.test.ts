import { describe, expect, it } from "vitest";

import { COMPANY_SETTINGS_TABS } from "./companySettingsTabs";
import {
  isAllowedLogoFile,
  LOGO_MAX_BYTES,
  warehouseProfileLabel,
  warehouseTypeLabel,
} from "./companySettingsUtils";

describe("company settings chrome", () => {
  it("exposes four Firma tabs in screenshot order", () => {
    expect(COMPANY_SETTINGS_TABS.map((t) => t.label)).toEqual([
      "Dane firmy",
      "Magazyny",
      "Firmy i przypisania",
      "Branding",
    ]);
  });
});

describe("warehouse display labels", () => {
  it("derives WMS profile label from requires_putaway", () => {
    expect(warehouseProfileLabel(true)).toBe("WMS (DOCK + putaway)");
    expect(warehouseProfileLabel(false)).toBe("Magazyn prosty (STOCK)");
    expect(warehouseProfileLabel(undefined)).toBe("WMS (DOCK + putaway)");
  });

  it("maps warehouse type codes", () => {
    expect(warehouseTypeLabel("own")).toBe("Własny");
    expect(warehouseTypeLabel(null)).toBe("Własny");
  });
});

describe("logo validation helpers", () => {
  it("accepts png/jpeg/svg and enforces 6 MB", () => {
    expect(isAllowedLogoFile(new File([""], "a.png", { type: "image/png" }))).toBe(true);
    expect(isAllowedLogoFile(new File([""], "a.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isAllowedLogoFile(new File([""], "a.svg", { type: "image/svg+xml" }))).toBe(true);
    expect(isAllowedLogoFile(new File([""], "a.gif", { type: "image/gif" }))).toBe(false);
    expect(LOGO_MAX_BYTES).toBe(6 * 1024 * 1024);
  });
});
