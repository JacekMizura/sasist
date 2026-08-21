/**
 * StatusActionsPanel — Sellasist projection UX; backend STATUS_ACTION SSOT.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "StatusActionsPanel.tsx"), "utf8");
const API = readFileSync(path.join(HERE, "../../api/automationsApi.ts"), "utf8");

describe("StatusActionsPanel SSOT", () => {
  it("uses list + upsert status-actions (one-rule model)", () => {
    expect(SRC).toContain("listStatusActions");
    expect(SRC).toContain("upsertStatusActions");
    expect(SRC).toContain("Automatyczne akcje po wejściu w status");
    expect(SRC).toContain("Wyślij e-mail klientowi");
    expect(SRC).toContain("Wyślij e-mail wewnętrzny");
    expect(SRC).toContain("Zatwierdź przyjęcie zwrotu w magazynie");
    expect(SRC).not.toContain("createAutomation");
  });

  it("does not advertise blocked Sellasist effects", () => {
    expect(SRC).not.toMatch(/Zwrot płatności|SMS|Korekta dokumentu|Przywróć stan/i);
  });

  it("does not write rules to localStorage", () => {
    expect(SRC).not.toMatch(/orderAutomationLocalStore/);
    expect(SRC).not.toMatch(/localStorage\.(setItem|getItem)/);
  });

  it("API exposes status-actions GET and PUT", () => {
    expect(API).toContain("automations/status-actions");
    expect(API).toContain("listStatusActions");
    expect(API).toContain("upsertStatusActions");
  });
});
