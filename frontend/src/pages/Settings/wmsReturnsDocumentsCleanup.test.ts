import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  WMS_RETURNS_MFG_SECTION_ID,
  WMS_RETURNS_MODE_SECTION_ID,
  WMS_RETURNS_SETTINGS_NAV_SECTIONS,
  WMS_RETURNS_ZPZ_SECTION_ID,
} from "./wmsReturnsSettingsNavSections";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Mirrors `resolveSectionId` in WmsSettingsSectionRegistryContext. */
function resolveSectionId(orderedIds: string[], candidate: string | null | undefined): string | null {
  if (orderedIds.length === 0) return null;
  if (candidate && orderedIds.includes(candidate)) return candidate;
  return orderedIds[0] ?? null;
}

describe("WMS Returns Dokumenty cleanup", () => {
  const panel = readFileSync(path.resolve(HERE, "./WmsReturnsSettingsPanel.tsx"), "utf8");
  const nav = readFileSync(path.resolve(HERE, "./wmsReturnsSettingsNavSections.ts"), "utf8");
  const catalog = readFileSync(path.resolve(HERE, "./settingsSearch/catalog.ts"), "utf8");

  it("nav has exactly Ogólne / Przyjęcie / Produkty produkowane", () => {
    expect(WMS_RETURNS_SETTINGS_NAV_SECTIONS.map((s) => s.label)).toEqual([
      "Ogólne",
      "Przyjęcie",
      "Produkty produkowane",
    ]);
    expect(WMS_RETURNS_SETTINGS_NAV_SECTIONS.map((s) => s.id)).toEqual([
      WMS_RETURNS_MODE_SECTION_ID,
      WMS_RETURNS_ZPZ_SECTION_ID,
      WMS_RETURNS_MFG_SECTION_ID,
    ]);
    expect(WMS_RETURNS_SETTINGS_NAV_SECTIONS.some((s) => s.label === "Dokumenty")).toBe(false);
    expect(nav).not.toContain('label: "Dokumenty"');
    expect(nav).not.toContain("wms-returns-document-templates");
  });

  it("panel has no return_document / DTE scope wiring", () => {
    expect(panel).not.toContain("DocumentTemplateScopeSection");
    expect(panel).not.toContain("RETURNS_SCOPE_KINDS");
    expect(panel).not.toContain("return_document");
    expect(panel).not.toContain("Szablony wydruków zwrotów");
    expect(panel).not.toContain("wms-returns-document-templates");
    expect(panel).not.toContain('scopeType="RETURNS"');
    expect(panel).not.toContain('title="Dokumenty"');
    expect(panel).not.toContain('label: "Dokumenty"');
  });

  it("settings search catalog has no Dokumenty section entry", () => {
    expect(catalog).not.toContain("wms-returns-document-templates");
    expect(catalog).not.toContain("returns.document");
    expect(catalog).toContain("wms-returns-workflow-mode");
    expect(catalog).toContain("wms-returns-z-pz-label");
  });

  it("unknown deep-link section falls back to Ogólne", () => {
    const ids = WMS_RETURNS_SETTINGS_NAV_SECTIONS.map((s) => s.id);
    expect(resolveSectionId(ids, "wms-returns-document-templates")).toBe(WMS_RETURNS_MODE_SECTION_ID);
    expect(resolveSectionId(ids, WMS_RETURNS_MFG_SECTION_ID)).toBe(WMS_RETURNS_MFG_SECTION_ID);
  });
});
