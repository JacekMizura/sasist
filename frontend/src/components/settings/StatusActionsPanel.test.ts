/**
 * StatusActionsPanel — Sellasist projection UX; backend STATUS_ACTION SSOT.
 * Edited status = trigger; no change_status in simplified panel.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "StatusActionsPanel.tsx"), "utf8");
const API = readFileSync(path.join(HERE, "../../api/automationsApi.ts"), "utf8");
const CATALOG = readFileSync(path.join(HERE, "../../utils/orderAutomationCatalog.ts"), "utf8");

describe("StatusActionsPanel SSOT", () => {
  it("uses list + upsert status-actions (one-rule model)", () => {
    expect(SRC).toContain("listStatusActions");
    expect(SRC).toContain("upsertStatusActions");
    expect(SRC).toContain("Automatyczne akcje po wejściu w status");
    expect(SRC).toContain("Zaznaczone akcje zostaną wykonane automatycznie");
    expect(SRC).toContain("Wyślij e-mail klientowi");
    expect(SRC).toContain("Wyślij e-mail wewnętrzny");
    expect(SRC).toContain("Zatwierdź przyjęcie zwrotu w magazynie");
    expect(SRC).not.toContain("createAutomation");
  });

  it("A/B/C — does not show change_status checkbox for any domain", () => {
    expect(SRC).not.toContain("Zmień status");
    expect(SRC).not.toMatch(/effect_type:\s*["']change_status["']/);
    expect(SRC).not.toContain('targetStatusId');
    expect(SRC).toContain("zaawansowaną akcję zmiany statusu");
  });

  it("ORDER/COMPLAINT catalog is emails only; RETURN adds warehouse_commit first", () => {
    expect(SRC).toContain('return ["warehouse_commit", "send_email_customer", "send_email_internal"]');
    expect(SRC).toContain('return ["send_email_customer", "send_email_internal"]');
  });

  it("does not advertise blocked Sellasist effects", () => {
    expect(SRC).not.toMatch(/Zwrot płatności|SMS|Korekta dokumentu|Przywróć stan|Dodaj tag|Drukuj/i);
    expect(SRC).not.toContain("add_tag");
    expect(SRC).not.toContain("assign_courier");
    expect(SRC).not.toContain("generate_document");
    expect(SRC).not.toContain("wms_action");
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

  it("L — main Automation Editor catalog still supports change_status", () => {
    expect(CATALOG).toContain('kind: "change_status"');
    expect(CATALOG).toMatch(/change_status[\s\S]*backendSupported:\s*true/);
  });
});
