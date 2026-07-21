import { describe, expect, it } from "vitest";
import {
  looksLikeTechnicalReplenishmentEnum,
  opsAlertLevelLabel,
  opsResolutionStatusLabel,
  opsSeverityLabel,
  replenishmentClassificationLabel,
  replenishmentPriorityBandLabel,
} from "./replenishmentUiLabels";

describe("replenishmentUiLabels", () => {
  it("maps classification enums to Polish", () => {
    expect(replenishmentClassificationLabel("ACTIONABLE")).toBe("Do uzupełnienia");
    expect(replenishmentClassificationLabel("NO_SOURCE_STOCK")).toBe("Brak stocku źródłowego");
    expect(replenishmentClassificationLabel("IN_PROGRESS")).toBe("W trakcie uzupełniania");
    expect(replenishmentClassificationLabel("SOMETHING_NEW")).toBe("Zdarzenie uzupełnienia");
  });

  it("maps priority bands to Polish", () => {
    expect(replenishmentPriorityBandLabel("HIGH")).toBe("Wysoki");
    expect(replenishmentPriorityBandLabel("MEDIUM")).toBe("Średni");
    expect(replenishmentPriorityBandLabel("LOW")).toBe("Niski");
  });

  it("maps ops severity and alert levels to Polish", () => {
    expect(opsSeverityLabel("blocked")).toBe("Zablokowane");
    expect(opsSeverityLabel("critical")).toBe("Krytyczne");
    expect(opsSeverityLabel("warning")).toBe("Ostrzeżenie");
    expect(opsAlertLevelLabel("critical")).toBe("Krytyczne");
    expect(opsResolutionStatusLabel("open")).toBe("Otwarte");
  });

  it("detects leaked technical enums", () => {
    expect(looksLikeTechnicalReplenishmentEnum("ACTIONABLE")).toBe(true);
    expect(looksLikeTechnicalReplenishmentEnum("HIGH")).toBe(true);
    expect(looksLikeTechnicalReplenishmentEnum("CRITICAL")).toBe(true);
    expect(looksLikeTechnicalReplenishmentEnum("Do uzupełnienia")).toBe(false);
  });
});
