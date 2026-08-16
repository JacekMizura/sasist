import { describe, expect, it } from "vitest";
import { FORECAST_STRATEGY_KEYS, forecastStrategyDisplayLabel } from "./forecastStrategyLabels";
import { FORECAST_STRATEGY_OPTIONS } from "./productionSettingsHelp";

describe("forecast strategy SSOT (3 strategies)", () => {
  it("select offers exactly PERIOD_AVERAGE / WEIGHTED_AVERAGE / WEEKDAY_AVERAGE", () => {
    expect(FORECAST_STRATEGY_OPTIONS.map((o) => o.key)).toEqual([
      "PERIOD_AVERAGE",
      "WEIGHTED_AVERAGE",
      "WEEKDAY_AVERAGE",
    ]);
    expect(FORECAST_STRATEGY_KEYS).toEqual([
      "PERIOD_AVERAGE",
      "WEIGHTED_AVERAGE",
      "WEEKDAY_AVERAGE",
    ]);
  });

  it("uses business labels Standardowa / Uwzględniaj trend / Według dni tygodnia", () => {
    expect(FORECAST_STRATEGY_OPTIONS.map((o) => o.label)).toEqual([
      "Standardowa",
      "Uwzględniaj trend",
      "Według dni tygodnia",
    ]);
    expect(forecastStrategyDisplayLabel("PERIOD_AVERAGE")).toBe("Standardowa");
    expect(forecastStrategyDisplayLabel("WEIGHTED_AVERAGE")).toBe("Uwzględniaj trend");
    expect(forecastStrategyDisplayLabel("WEEKDAY_AVERAGE")).toBe("Według dni tygodnia");
  });

  it("does not reference removed strategies in options or labels", () => {
    const blob = JSON.stringify({
      options: FORECAST_STRATEGY_OPTIONS,
      keys: FORECAST_STRATEGY_KEYS,
      labels: [
        forecastStrategyDisplayLabel("PERIOD_AVERAGE"),
        forecastStrategyDisplayLabel("WEIGHTED_AVERAGE"),
        forecastStrategyDisplayLabel("WEEKDAY_AVERAGE"),
      ],
    });
    expect(blob).not.toMatch(/MEDIAN|MAX_DAILY|AI_SMART|Starsza strategia/);
  });
});
