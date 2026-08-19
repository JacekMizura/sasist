import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DIRECT_SALES_SETTINGS_NAV_SECTIONS } from "./directSalesSettingsNavSections";
import { DEAD_DIRECT_SALES_TERMINAL_SETTING_KEYS } from "./schemas/directSalesSettingsSchema";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const DEAD_TERMINAL_KEYS = [...DEAD_DIRECT_SALES_TERMINAL_SETTING_KEYS];

describe("direct sales terminal settings cleanup", () => {
  const panel = readFileSync(path.resolve(HERE, "./DirectSalesSettingsPanel.tsx"), "utf8");
  const payments = readFileSync(path.resolve(HERE, "./sections/PaymentsSection.tsx"), "utf8");
  const nav = readFileSync(path.resolve(HERE, "./directSalesSettingsNavSections.ts"), "utf8");
  const catalog = readFileSync(
    path.resolve(HERE, "../../../pages/Settings/settingsSearch/catalog.ts"),
    "utf8",
  );
  const schema = readFileSync(path.resolve(HERE, "./schemas/directSalesSettingsSchema.ts"), "utf8");
  const beSchema = readFileSync(
    path.resolve(HERE, "../../../../../backend/schemas/direct_sales_settings.py"),
    "utf8",
  );
  const beService = readFileSync(
    path.resolve(HERE, "../../../../../backend/services/direct_sales_settings_service.py"),
    "utf8",
  );
  const terminalHook = readFileSync(
    path.resolve(HERE, "../../../hooks/directSales/useDirectSalesTerminal.ts"),
    "utf8",
  );
  const scanHandler = readFileSync(
    path.resolve(HERE, "../../../components/wms/execution/useWmsPageScanHandler.ts"),
    "utf8",
  );

  it("F) nav does not contain ds-terminal / Zaawansowane", () => {
    expect(DIRECT_SALES_SETTINGS_NAV_SECTIONS.some((s) => s.id === "ds-terminal")).toBe(false);
    expect(DIRECT_SALES_SETTINGS_NAV_SECTIONS.some((s) => s.label === "Zaawansowane")).toBe(false);
    expect(nav).not.toContain("ds-terminal");
  });

  it("G) Payments section contains keyboard_shortcuts under terminal block", () => {
    expect(panel).toContain("<PaymentsSection");
    expect(panel).not.toContain("TerminalSection");
    expect(payments).toContain("Obsługa terminala");
    expect(payments).toContain("Włącz skróty klawiaturowe");
    expect(payments).toContain("keyboard_shortcuts");
  });

  it("search catalog points keyboard_shortcuts to ds-payments, not ds-terminal", () => {
    expect(catalog).toContain('id: "direct_sales.keyboard_shortcuts"');
    expect(catalog).toContain('sectionId: "ds-payments"');
    expect(catalog).not.toContain("direct_sales.scanner_mode");
    expect(catalog).not.toContain("ds-terminal");
  });

  it("dead terminal keys are strip/preserve only — no live schema fields", () => {
    for (const key of DEAD_TERMINAL_KEYS) {
      expect(beSchema).not.toContain(`${key}:`);
      expect(schema).not.toContain(`${key}:`);
      expect(schema).toContain(`"${key}"`);
      expect(beService).toContain(`"${key}"`);
    }
    expect(schema).toContain("keyboard_shortcuts:");
    expect(beSchema).toContain("keyboard_shortcuts:");
  });

  it("H) scanner runtime has zero readers for dead terminal settings", () => {
    for (const key of DEAD_TERMINAL_KEYS) {
      expect(terminalHook).not.toContain(key);
      expect(scanHandler).not.toContain(key);
    }
    expect(terminalHook).toContain("keyboard_shortcuts");
  });
});
