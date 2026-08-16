import type { ProductionForecastSettings } from "../../../api/wmsProductionSettingsApi";

export type ForecastStrategyKey = ProductionForecastSettings["strategy"];

export const FORECAST_STRATEGY_KEYS = [
  "PERIOD_AVERAGE",
  "WEIGHTED_AVERAGE",
  "WEEKDAY_AVERAGE",
] as const satisfies readonly ForecastStrategyKey[];

const BUSINESS_LABELS: Record<ForecastStrategyKey, string> = {
  PERIOD_AVERAGE: "Standardowa",
  WEIGHTED_AVERAGE: "Uwzględniaj trend",
  WEEKDAY_AVERAGE: "Według dni tygodnia",
};

/** Business label for settings / planning (SSOT with backend strategy labels). */
export function forecastStrategyDisplayLabel(key: string | null | undefined): string {
  if (key && key in BUSINESS_LABELS) {
    return BUSINESS_LABELS[key as ForecastStrategyKey];
  }
  return BUSINESS_LABELS.PERIOD_AVERAGE;
}
