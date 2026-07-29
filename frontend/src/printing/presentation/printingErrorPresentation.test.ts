import { describe, expect, it } from "vitest";

import { parsePrintJobError, printJobErrorSummary } from "./printingErrorPresentation";

describe("printingErrorPresentation", () => {
  it("parses structured JSON error_message from agent", () => {
    const raw = JSON.stringify({
      technical: "(31, 'ShellExecute', 'device error') (drukarka: HP)",
      friendly: "Drukarka jest niedostępna lub odłączona.",
      suggestion: "Sprawdź kabel USB.",
    });
    const parsed = parsePrintJobError(raw);
    expect(parsed?.friendly).toContain("niedostępna");
    expect(parsed?.technical).toContain("ShellExecute");
    expect(parsed?.suggestion).toContain("USB");
    expect(printJobErrorSummary(raw)).toContain("niedostępna");
  });

  it("falls back for legacy plain-text errors", () => {
    const raw = "(31, 'ShellExecute', 'Urządzenie dołączone do komputera nie działa.')";
    const parsed = parsePrintJobError(raw);
    expect(parsed?.friendly).toBe(raw);
    expect(printJobErrorSummary(raw)).toBe(raw);
  });
});
